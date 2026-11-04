import { Queue } from "bullmq";

import { redisConnectionOptions } from "../configs/redis.config";
import { RowAuditJobData } from "../types/row-audit.type";

let rowAuditQueue: Queue<RowAuditJobData> | null = null;

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

export async function closeRowAuditQueue() {
    if (rowAuditQueue) {
        await rowAuditQueue.close();
        rowAuditQueue = null;
    }
}
