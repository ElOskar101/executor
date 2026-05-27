import { Job } from "bullmq";

import { getPlaywrightRootFolder, assertAllowedPlaywrightProject } from "../configs/playwright.config";
import { ExecutionModel } from "../models/execution.model";
import { getExecutionQueue } from "../queues/execution.queue";
import { CreateExecutionRequest, ExecutionJobData, ExecutionStatus } from "../types/execution.type";
import { readExecutionLog } from "../adapters/mongo.adapter";
import { publishPauseExecution, publishResumeExecution, publishStopExecution } from "./realtime.service";
import { createLogger } from "../libs/logger";

const DEFAULT_WORKERS = 1;
const DEFAULT_RETRIES = 0;
const logger = createLogger("system");

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(1, Math.min(Math.trunc(numberValue), max));
}

function normalizeRetries(value: unknown) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return DEFAULT_RETRIES;
    return Math.max(0, Math.min(Math.trunc(numberValue), Number(process.env.MAX_PLAYWRIGHT_RETRIES || 3)));
}

export async function createExecution(payload: CreateExecutionRequest) {
    assertAllowedPlaywrightProject(payload.project);

    const playwrightFolder = getPlaywrightRootFolder();
    const execution = await ExecutionModel.create({
        createdBy: payload.createdBy,
        playwrightProject: payload.project,
        status: "queued" satisfies ExecutionStatus,
        client: payload.client,
        clinic: payload.clinic,
        execution: payload.execution,
        botName: payload.botName,
        meta: payload.meta
    });

    const jobData: ExecutionJobData = {
        executionId: execution.id,
        project: payload.project,
        workers: normalizePositiveInteger(payload.meta.workers, DEFAULT_WORKERS, Number(process.env.MAX_PLAYWRIGHT_WORKERS || 10)),
        retries: normalizeRetries(payload.meta.retries),
        headed: Boolean(payload.meta.headed),
        playwrightFolder,
    };

    const queue = getExecutionQueue();
    const job = await queue.add("run-playwright-project", jobData, {
        jobId: execution.id,
    });

    logger.info(
        `Enqueued job=${job.id} executionId=${execution.id} project=${payload.project} workers=${jobData.workers} retries=${jobData.retries} headed=${jobData.headed}`,
    );

    const updatedExecution = await ExecutionModel.findByIdAndUpdate(
        execution.id,
        {
            jobId: job.id,
            playwrightExecutionId: job.id,
        },
        { new: true },
    ).lean();

    return updatedExecution;
}

export async function listExecutions() {
    return ExecutionModel.find({}).sort({ createdAt: -1 }).lean();
}

export async function getExecutionById(id: string) {
    return ExecutionModel.findById(id).lean();
}

export async function getExecutionWithLogs(id: string) {
    const execution = await getExecutionById(id);
    if (!execution) return null;

    return {
        ...execution,
        logs: await readExecutionLog(id),
    };
}

export async function stopExecutionById(id: string) {
    const execution = await ExecutionModel.findById(id).lean();
    if (!execution) return null;

    if (execution.runId) {
        const queue = getExecutionQueue();
        const job = await Job.fromId(queue, execution.runId);

        if (job) {
            const state = await job.getState();

            if (state === "waiting" || state === "delayed" || state === "prioritized") {
                await job.remove();
            }
        }
    }

    await publishStopExecution(id);

    return ExecutionModel.findByIdAndUpdate(
        id,
        {
            status: "cancelled",
            finishedAt: new Date(),
        },
        { new: true },
    ).lean();
}

export async function pauseExecutionById(id: string) {
    const execution = await ExecutionModel.findById(id).lean();
    if (!execution) return null;

    await publishPauseExecution(id);

    return ExecutionModel.findByIdAndUpdate(
        id,
        {
            status: "paused" satisfies ExecutionStatus,
        },
        { new: true },
    ).lean();
}

export async function resumeExecutionById(id: string) {
    const execution = await ExecutionModel.findById(id).lean();
    if (!execution) return null;

    await publishResumeExecution(id);

    return ExecutionModel.findByIdAndUpdate(
        id,
        {
            status: "running" satisfies ExecutionStatus,
        },
        { new: true },
    ).lean();
}

