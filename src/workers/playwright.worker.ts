import "dotenv/config";

import { ChildProcessByStdio } from "node:child_process";
import os from "node:os";
import { Readable } from "node:stream";

import mongoose from "mongoose";
import { Worker } from "bullmq";

import { connectDb } from "../connection.db";
import { REDIS_CHANNELS, createRedisConnection, EXECUTION_QUEUE_NAME, redisConnectionOptions } from "../configs/redis.config";
import { assertAllowedPlaywrightProject } from "../configs/playwright.config";
import { runPlaywrightProject } from "../libs/command-executor";
import { ExecutionJobData, ExecutionStatus } from "../types/execution.type";
import { createExecutionEventWriter } from "../services/execution-event-writer.service";
import { createExecutionLogSink } from "../services/execution-log-writer.service";
import { createExecutionRealtimeWriter } from "../services/execution-realtime-writer.service";

// ---------------------------------------------------------------------------
// Core execution logic — transport-agnostic
// These functions do NOT depend on BullMQ or any specific job transport.
// They can be called from BullMQ workers, HTTP handlers, CLI scripts, etc.
// ---------------------------------------------------------------------------

/** Maximum time (ms) a process can remain paused before the system cancels it. Default: 1 hour. */
const MAX_PAUSE_DURATION_MS = Number(process.env.MAX_PAUSE_DURATION_MS || 60 * 60 * 1000);

type ActiveProcess = {
    child: ChildProcessByStdio<null, Readable, Readable>;
    stopping: boolean;
    paused: boolean;
    /** Reason set when the system (not the user) cancels the process (e.g. max pause exceeded). Persisted as a note. */
    cancelReason?: string;
    /** Timer that auto-cancels the process if it stays paused longer than MAX_PAUSE_DURATION_MS */
    pauseTimer?: ReturnType<typeof setTimeout>;
};

const activeProcesses = new Map<string, ActiveProcess>();
const workerId = process.env.WORKER_ID || `${os.hostname() || "worker"}:${process.pid}`;

function sendSignal(child: ChildProcessByStdio<null, Readable, Readable>, signal: NodeJS.Signals) {
    if (!child.pid) return false;

    try {
        process.kill(-child.pid, signal);
        return true;
    } catch {
        try {
            process.kill(child.pid, signal);
            return true;
        } catch {
            return false;
        }
    }
}

function killProcessTree(child: ChildProcessByStdio<null, Readable, Readable>) {
    if (!child.pid) return;

    const terminated = sendSignal(child, "SIGTERM");
    if (!terminated) return;

    setTimeout(() => {
        if (child.killed) return;

        sendSignal(child, "SIGKILL");
    }, Number(process.env.STOP_KILL_GRACE_MS || 10000)).unref();
}

function formatPersistedLogChunk(stream: "stdout" | "stderr" | "system", message: string) {
    return `[${new Date().toISOString()}] [${stream}] ${message}`;
}

async function stopLocalExecution(executionId: string, reason?: string) {
    const activeProcess = activeProcesses.get(executionId);
    if (!activeProcess) return false;
    const realtimeWriter = createExecutionRealtimeWriter({ executionId });

    // Clear any pending pause timeout so it doesn't fire after stop
    if (activeProcess.pauseTimer) {
        clearTimeout(activeProcess.pauseTimer);
        activeProcess.pauseTimer = undefined;
    }

    activeProcess.stopping = true;
    if (reason) activeProcess.cancelReason = reason;
    const message = reason ?? "Stop requested. Sending SIGTERM to Playwright process.";
    console.info(`[WORKER] Stop requested for executionId=${executionId}${reason ? ` reason="${reason}"` : ""}`);
    await realtimeWriter.publishLog({ stream: "system", message });
    killProcessTree(activeProcess.child);
    return true;
}

async function pauseLocalExecution(executionId: string) {
    const activeProcess = activeProcesses.get(executionId);
    if (!activeProcess || activeProcess.stopping || activeProcess.paused) return false;
    const realtimeWriter = createExecutionRealtimeWriter({ executionId });

    const paused = sendSignal(activeProcess.child, "SIGSTOP");
    if (!paused) return false;

    activeProcess.paused = true;

    // Auto-cancel if paused longer than MAX_PAUSE_DURATION_MS
    activeProcess.pauseTimer = setTimeout(() => {
        console.warn(`[WORKER] executionId=${executionId} exceeded max pause duration (${MAX_PAUSE_DURATION_MS}ms). Cancelling.`);
        void stopLocalExecution(
            executionId,
            `Execution cancelled by system: paused for more than ${MAX_PAUSE_DURATION_MS / 1000}s without being resumed.`,
        );
    }, MAX_PAUSE_DURATION_MS).unref();

    await realtimeWriter.publishLog({
        stream: "system",
        message: "Pause requested. Sending SIGSTOP to Playwright process.",
    });
    await realtimeWriter.publishStatus({
        status: "paused",
        pid: activeProcess.child.pid,
    });
    return true;
}

async function resumeLocalExecution(executionId: string) {
    const activeProcess = activeProcesses.get(executionId);
    if (!activeProcess || activeProcess.stopping || !activeProcess.paused) return false;
    const realtimeWriter = createExecutionRealtimeWriter({ executionId });

    const resumed = sendSignal(activeProcess.child, "SIGCONT");
    if (!resumed) return false;

    activeProcess.paused = false;

    // Clear the auto-cancel timer since the process is running again
    if (activeProcess.pauseTimer) {
        clearTimeout(activeProcess.pauseTimer);
        activeProcess.pauseTimer = undefined;
    }

    await realtimeWriter.publishLog({
        stream: "system",
        message: "Resume requested. Sending SIGCONT to Playwright process.",
    });
    await realtimeWriter.publishStatus({
        status: "running",
        pid: activeProcess.child.pid,
    });
    return true;
}

// ---------------------------------------------------------------------------
// Public API — callable from any transport (BullMQ, HTTP, CLI, IPC, etc.)
// ---------------------------------------------------------------------------

export async function stopExecution(executionId: string): Promise<boolean> {
    return stopLocalExecution(executionId);
}

export async function runExecution(data: ExecutionJobData & { jobId?: string }): Promise<void> {
    return handleExecutionJob(data);
}

// ---------------------------------------------------------------------------
// Internal handlers
// ---------------------------------------------------------------------------

async function handleExecutionJob(data: ExecutionJobData & { jobId?: string }) {
    const { executionId, project, workers, retries, headed, playwrightFolder, jobId } = data;
    assertAllowedPlaywrightProject(project);

    const resolvedJobId = String(jobId || "direct");

    console.info(
        `[WORKER] Starting job=${resolvedJobId} project=${project} workers=${workers} retries=${retries} headed=${headed}`,
    );

    const logSink = createExecutionLogSink(executionId); // Playwright process stdout/stderr
    const eventWriter = createExecutionEventWriter(executionId); // Execution state fallowing up (running, failed, canceled)
    const realtimeWriter = createExecutionRealtimeWriter({ executionId, jobId: resolvedJobId });
    const child = runPlaywrightProject({ project, workers, retries, headed, playwrightFolder, jobId: resolvedJobId });

    activeProcesses.set(executionId, { child, stopping: false, paused: false });

    await eventWriter.markRunning({ pid: child.pid, jobId: resolvedJobId });

    await realtimeWriter.publishStatus({
        status: "running",
        pid: child.pid,
    });

    await realtimeWriter.publishLog({
        stream: "system",
        message: `Running: npx playwright test --project=${project} --workers=${workers} --retries=${retries}${headed ? " --headed" : ""}`,
    });
    await logSink.append(
        formatPersistedLogChunk(
            "system",
            `Running: npx playwright test --project=${project} --workers=${workers} --retries=${retries}${headed ? " --headed" : ""}\n`,
        ),
    );

    const writeOutput = async (stream: "stdout" | "stderr", data: Buffer) => {
        const message = data.toString();
        await logSink.append(formatPersistedLogChunk(stream, message));
        await realtimeWriter.publishLog({
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
            await logSink.append(formatPersistedLogChunk("system", `${error.message}\n`));
            await logSink.close();
            await eventWriter.markFailed(error.message);
            await realtimeWriter.publishStatus({
                status: "failed",
                error: error.message,
            });
            reject(error);
        });
        // When process ends (naturally or killed by user interaction)
        child.on("close", async (code, signal) => {
            const activeProcess = activeProcesses.get(executionId);
            const cancelled = activeProcess?.stopping || signal === "SIGTERM" || signal === "SIGKILL";
            const status: ExecutionStatus = cancelled ? "cancelled" : code === 0 ? "completed" : "failed";
            const error = status === "failed"
                ? `Playwright exited with code ${code}`
                : activeProcess?.cancelReason; // system-cancel note (e.g. max pause exceeded)

            console.info(
                `[WORKER] Finished job=${resolvedJobId} executionId=${executionId} status=${status} code=${code} signal=${signal || ""}`,
            );

            activeProcesses.delete(executionId);
            await logSink.append(
                formatPersistedLogChunk("system", `Finished with status=${status} code=${code} signal=${signal || ""}\n`),
            );
            await logSink.close();

            await eventWriter.markFinished({ status, note: error });
            await realtimeWriter.publishStatus({
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

// ---------------------------------------------------------------------------
// Infrastructure bootstrap — shared by all queues
// Connects to Mongo and returns a disconnect handle.
// The composition root (main or any entry point) is the right place for this.
// ---------------------------------------------------------------------------

export async function bootstrapInfrastructure() {
    await connectDb();
    return {
        disconnect: async () => {
            await mongoose.disconnect();
        },
    };
}

// ---------------------------------------------------------------------------
// BullMQ transport — one way to consume execution jobs
// Swap this section for HTTP/CLI/IPC without touching the core logic above.
// ---------------------------------------------------------------------------

async function startBullMQTransport() {
    // Redis Pub/Sub control channel: receives real-time stop signals
    // (separate from BullMQ's own Redis connection)
    const controlSubscriber = createRedisConnection();
    await controlSubscriber.subscribe(REDIS_CHANNELS.control);
    controlSubscriber.on("message", (_channel, message) => {// For instant requests
        try {
            const payload = JSON.parse(message) as { type?: string; executionId?: string };
            if (!payload.executionId) return;

            if (payload.type === "stop-execution") {
                void stopLocalExecution(payload.executionId);
                return;
            }

            if (payload.type === "pause-execution") {
                void pauseLocalExecution(payload.executionId);
                return;
            }

            if (payload.type === "resume-execution") {
                void resumeLocalExecution(payload.executionId);
            }
        } catch (error) {
            console.error("[WORKER] Invalid control message", error);
        }
    });

    const worker = new Worker<ExecutionJobData>( // For queued jobs
        EXECUTION_QUEUE_NAME,
        async (job) => {
            // Bridge: BullMQ job → core execution logic
            await handleExecutionJob({ ...job.data, jobId: String(job.id || "1") });
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

    return {
        close: async () => {
            await worker.close();
            controlSubscriber.disconnect();
        },
    };
}

// ---------------------------------------------------------------------------
// Entry point — only runs when this file is executed directly
// ---------------------------------------------------------------------------

async function main() {
    const infra = await bootstrapInfrastructure();
    const transport = await startBullMQTransport();

    const shutdown = async (signal: string) => {
        console.info(`[WORKER] Received ${signal}. Stopping active executions...`);
        await Promise.all([...activeProcesses.keys()].map((id) => stopLocalExecution(id)));
        await transport.close();
        await infra.disconnect();
        process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
    console.error("[WORKER] Failed to start", error);
    process.exit(1);
});
