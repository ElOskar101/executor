import { Queue, QueueEvents } from "bullmq";

import { redisConnectionOptions } from "../configs/redis.config";
import { RowAuditJobData } from "../types/row-audit.type";
import { createExecutionRealtimePersister } from "../services/execution-realtime-persister.service";

let rowAuditQueue: Queue<RowAuditJobData> | null = null;
let rowAuditQueueEvents: QueueEvents | null = null;

export function getRowAuditQueue() {
    if (!rowAuditQueue) {
        rowAuditQueue = new Queue<RowAuditJobData>("row-audit", {
            connection: redisConnectionOptions,
            defaultJobOptions: {
                attempts: Number(process.env.ROW_AUDIT_JOB_ATTEMPTS || 3),
                backoff: {
                    type: "exponential",
                    delay: Number(process.env.ROW_AUDIT_JOB_BACKOFF_MS || 5000),
                },
                removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
                removeOnFail: { age: 60 * 60 * 24 * 30, count: 5000 },
            },
        });
    }

    return rowAuditQueue;
}

export function getRowAuditQueueEvents() {
    if (!rowAuditQueueEvents) {
        const realtimePersister = createExecutionRealtimePersister();
        rowAuditQueueEvents = new QueueEvents("row-audit", { connection: redisConnectionOptions });
        rowAuditQueueEvents.on("error", (error) => console.error("[ROW AUDIT] Queue event error", error));
        rowAuditQueueEvents.on("active", async ({ jobId }) => {
            try {
                await realtimePersister.persistRowAuditStatus(jobId, "running");
            } catch (error) {
                console.error("[ROW AUDIT] Failed to persist running status", error);
            }
        });
    }

    return rowAuditQueueEvents;
}

export async function closeRowAuditQueue() {
    if (rowAuditQueueEvents) {
        await rowAuditQueueEvents.close();
        rowAuditQueueEvents = null;
    }
    if (rowAuditQueue) {
        await rowAuditQueue.close();
        rowAuditQueue = null;
    }
}
