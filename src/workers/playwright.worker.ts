import "dotenv/config";

import { ChildProcessByStdio } from "node:child_process";
import os from "node:os";
import { Readable } from "node:stream";

import mongoose from "mongoose";
import { Job, Worker } from "bullmq";

import { connectDb } from "../connection.db";
import { REDIS_CHANNELS, createRedisConnection, EXECUTION_QUEUE_NAME, redisConnectionOptions } from "../configs/redis.config";
import { assertAllowedPlaywrightProject } from "../configs/playwright.config";
import { runPlaywrightProject } from "../libs/command-executor";
import { ExecutionModel } from "../models/execution.model";
import { ExecutionJobData, ExecutionStatus } from "../types/execution.type";
import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";
import { closeLogStream, createExecutionLogStream } from "../services/log.service";
import { publishExecutionLog, publishExecutionStatus } from "../services/realtime.service";

type ActiveProcess = {
    child: ChildProcessByStdio<null, Readable, Readable>;
    stopping: boolean;
};

const activeProcesses = new Map<string, ActiveProcess>();
const workerId = process.env.WORKER_ID || `${os.hostname() || "worker"}:${process.pid}`;

function now() {
    return new Date().toISOString();
}

async function publishLog(event: Omit<ExecutionLogEvent, "timestamp">) {
    await publishExecutionLog({
        ...event,
        timestamp: now(),
    });
}

async function publishStatus(event: Omit<ExecutionStatusEvent, "timestamp">) {
    await publishExecutionStatus({
        ...event,
        timestamp: now(),
    });
}

function killProcessTree(child: ChildProcessByStdio<null, Readable, Readable>) {
    if (!child.pid) return;

    try {
        process.kill(-child.pid, "SIGTERM");
    } catch {
        try {
            process.kill(child.pid, "SIGTERM");
        } catch {
            return;
        }
    }

    setTimeout(() => {
        if (child.killed) return;

        try {
            process.kill(-child.pid!, "SIGKILL");
        } catch {
            try {
                process.kill(child.pid!, "SIGKILL");
            } catch {
                // Process already exited.
            }
        }
    }, Number(process.env.STOP_KILL_GRACE_MS || 10000)).unref();
}

async function stopLocalExecution(executionId: string) {
    const activeProcess = activeProcesses.get(executionId);
    if (!activeProcess) return false;

    activeProcess.stopping = true;
    console.info(`[WORKER] Stop requested for executionId=${executionId}`);
    await publishLog({
        executionId,
        stream: "system",
        message: "Stop requested. Sending SIGTERM to Playwright process.",
    });
    killProcessTree(activeProcess.child);
    return true;
}

async function handleStopJob(job: Job<ExecutionJobData>) {
    await stopLocalExecution(job.data.executionId);
}

async function handleExecutionJob(job: Job<ExecutionJobData>) {
    const { executionId, project, workers, retries, headed, playwrightFolder, mode } = job.data;
    assertAllowedPlaywrightProject(project);

    console.info(
        `[WORKER] Starting job=${job.id} executionId=${executionId} project=${project} workers=${workers} retries=${retries} headed=${headed}`,
    );

    const logStream = createExecutionLogStream(executionId);
    const child = runPlaywrightProject({ project, workers, retries, headed, playwrightFolder, jobId: job.id || '1', mode });

    activeProcesses.set(executionId, { child, stopping: false });

    await ExecutionModel.findByIdAndUpdate(executionId, {
        pid: child.pid,
        status: "running" satisfies ExecutionStatus,
        startedAt: new Date(),
        jobId: job.id,
        playwrightExecutionId: job.id,
    });

    await publishStatus({
        executionId,
        jobId: job.id,
        status: "running",
        pid: child.pid,
    });

    await publishLog({
        executionId,
        jobId: job.id,
        stream: "system",
        message: `Running: npx playwright test --project=${project} --workers=${workers} --retries=${retries}${headed ? " --headed" : ""}`,
    });

    const writeOutput = async (stream: "stdout" | "stderr", data: Buffer) => {
        const message = data.toString();
        logStream.write(message);
        await publishLog({
            executionId,
            jobId: job.id,
            stream,
            message,
        });
    };

    child.stdout.on("data", (data: Buffer) => {
        void writeOutput("stdout", data);
    });

    child.stderr.on("data", (data: Buffer) => {
        void writeOutput("stderr", data);
    });

    return new Promise<void>((resolve, reject) => {
        child.on("error", async (error) => {
            activeProcesses.delete(executionId);
            logStream.write(`\n[system] ${error.message}\n`);
            await closeLogStream(logStream);
            await ExecutionModel.findByIdAndUpdate(executionId, {
                status: "error",
                error: error.message,
                finishedAt: new Date(),
            });
            await publishStatus({
                executionId,
                jobId: job.id,
                status: "error",
                error: error.message,
            });
            reject(error);
        });

        child.on("close", async (code, signal) => {
            const activeProcess = activeProcesses.get(executionId);
            const cancelled = activeProcess?.stopping || signal === "SIGTERM" || signal === "SIGKILL";
            const status: ExecutionStatus = cancelled ? "cancelled" : code === 0 ? "completed" : "failed";
            const error = status === "failed" ? `Playwright exited with code ${code}` : undefined;

            console.info(
                `[WORKER] Finished job=${job.id} executionId=${executionId} status=${status} code=${code} signal=${signal || ""}`,
            );

            activeProcesses.delete(executionId);
            logStream.write(`\n[system] Finished with status=${status} code=${code} signal=${signal || ""}\n`);
            await closeLogStream(logStream);

            await ExecutionModel.findByIdAndUpdate(executionId, {
                status,
                error,
                finishedAt: new Date(),
            });
            await publishStatus({
                executionId,
                jobId: job.id,
                status,
                exitCode: code,
                error,
            });

            if (status === "failed") {
                reject(new Error(error));
                return;
            }

            resolve();
        });
    });
}

async function main() {
    await connectDb();

    const controlSubscriber = createRedisConnection();
    await controlSubscriber.subscribe(REDIS_CHANNELS.control);
    controlSubscriber.on("message", (_channel, message) => {
        try {
            const payload = JSON.parse(message) as { type?: string; executionId?: string };
            if (payload.type === "stop-execution" && payload.executionId) {
                void stopLocalExecution(payload.executionId);
            }
        } catch (error) {
            console.error("[WORKER] Invalid control message", error);
        }
    });

    const worker = new Worker<ExecutionJobData>(
        EXECUTION_QUEUE_NAME,
        async (job) => {
            if (job.name === "stop-playwright-project") {
                await handleStopJob(job);
                return;
            }

            await handleExecutionJob(job);
        },
        {
            connection: redisConnectionOptions,
            concurrency: Number(process.env.WORKER_CONCURRENCY || 3),
        },
    );

    worker.on("ready", () => {
        console.info(`[WORKER] ${workerId} listening on queue ${EXECUTION_QUEUE_NAME}`);
    });

    worker.on("active", (job) => {
        console.info(`[WORKER] Active job=${job.id} name=${job.name}`);
    });

    worker.on("completed", (job) => {
        console.info(`[WORKER] Completed job=${job.id} name=${job.name}`);
    });

    worker.on("failed", (job, error) => {
        console.error(`[WORKER] Job ${job?.id || "unknown"} failed`, error);
    });

    worker.on("error", (error) => {
        console.error("[WORKER] Worker error", error);
    });

    const shutdown = async (signal: string) => {
        console.info(`[WORKER] Received ${signal}. Stopping active executions...`);
        await Promise.all([...activeProcesses.keys()].map(stopLocalExecution));
        await worker.close();
        controlSubscriber.disconnect();
        await mongoose.disconnect();
        process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
    console.error("[WORKER] Failed to start", error);
    process.exit(1);
});
