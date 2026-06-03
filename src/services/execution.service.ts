import {Job} from "bullmq";

import {assertAllowedPlaywrightProject, getPlaywrightRootFolder} from "../configs/playwright.config";
import {ExecutionModel} from "../models/execution.model";
import {getExecutionQueue} from "../queues/execution.queue";
import {CreateExecutionRequest, ExecutionJobData, ExecutionStatus} from "../types/execution.type";
import {readExecutionLog} from "../adapters/mongo.adapter";
import {publishPauseExecution, publishResumeExecution, publishStopExecution} from "./realtime.service";
import {createLogger} from "../libs/logger";

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
    return enqueueExecution(payload, "queued");
}

export async function createScheduledExecution(payload: CreateExecutionRequest) {
    const scheduledAtValue = payload.scheduledAt;
    const scheduledAtDate = scheduledAtValue ? new Date(scheduledAtValue) : null;
    const delay = scheduledAtDate && !Number.isNaN(scheduledAtDate.getTime())
        ? Math.max(0, scheduledAtDate.getTime() - Date.now())
        : 0;

    return enqueueExecution(payload, "scheduled", delay, scheduledAtDate ?? undefined);
}

async function enqueueExecution(payload: CreateExecutionRequest, status: ExecutionStatus, delay = 0, scheduledAt?: Date) {
    assertAllowedPlaywrightProject(payload.project);

    const playwrightFolder = getPlaywrightRootFolder();
    const workers = normalizePositiveInteger(payload.meta.workers, DEFAULT_WORKERS, Number(process.env.MAX_PLAYWRIGHT_WORKERS || 10));
    const retries = normalizeRetries(payload.meta.retries);
    const headed = Boolean(payload.meta.headed);
    const normalizedMeta = {
        ...payload.meta,
        workers,
        retries,
        headed,
    };

    const execution = await ExecutionModel.create({
        createdBy: payload.createdBy,
        playwrightProject: payload.project,
        status,
        client: payload.client,
        clinic: payload.clinic,
        execution: payload.execution,
        botName: payload.botName,
        scheduledAt,
        meta: normalizedMeta,
    });

    const jobData: ExecutionJobData = {
        executionId: execution.id,
        project: payload.project,
        workers,
        retries,
        headed,
        playwrightFolder,
        meta: normalizedMeta,
    };

    const queue = getExecutionQueue();
    const job = await queue.add(
        "run-playwright-project",
        jobData,
        {
            jobId: execution.id,
            ...(delay > 0 ? { delay } : {}), // If delay does not exist or is in the past it will be added to the queue immediately
        },
    );

    logger.info(
        `Enqueued job=${job.id} executionId=${execution.id} project=${payload.project} workers=${jobData.workers} retries=${jobData.retries} headed=${jobData.headed}`,
    );

    return ExecutionModel.findByIdAndUpdate(
        execution.id,
        {
            jobId: job.id,
            playwrightExecutionId: job.id,
        },
        {new: true},
    ).lean();
}

export async function listExecutions(query?:any, limit?: number) {
    return ExecutionModel.find(query ?? {}).sort({ createdAt: -1 })
        .limit(limit ?? 999)
        .lean();
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

export async function runScheduledExecutionNowById(id: string) {
    const execution = await ExecutionModel.findById(id).lean();
    if (!execution) return null;

    const queue = getExecutionQueue();
    const job = await Job.fromId(queue, id);
    if (!job) return null;

    const state = await job.getState();
    if (state === "delayed") {
        await job.promote();
    }

    return ExecutionModel.findByIdAndUpdate(
        id,
        {
            status: "queued" satisfies ExecutionStatus,
        },
        { new: true },
    ).lean();
}

