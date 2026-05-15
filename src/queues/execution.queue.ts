import { Queue, QueueEvents } from "bullmq";

import { EXECUTION_QUEUE_NAME, redisConnectionOptions } from "../configs/redis.config";
import { ExecutionJobData } from "../types/execution.type";

let executionQueue: Queue<ExecutionJobData> | null = null;
let executionQueueEvents: QueueEvents | null = null;

export function getExecutionQueue() {
    if (!executionQueue) {
        executionQueue = new Queue<ExecutionJobData>(EXECUTION_QUEUE_NAME, {
            connection: redisConnectionOptions,
            defaultJobOptions: {
                attempts: Number(process.env.EXECUTION_JOB_ATTEMPTS || 3),
                backoff: {
                    type: "exponential",
                    delay: Number(process.env.EXECUTION_JOB_BACKOFF_MS || 5000),
                },
                removeOnComplete: {
                    age: 60 * 60 * 24 * 7,
                    count: 1000,
                },
                removeOnFail: {
                    age: 60 * 60 * 24 * 30,
                    count: 5000,
                },
            },
        });
    }

    return executionQueue;
}

export function getExecutionQueueEvents() {
    if (!executionQueueEvents) {
        executionQueueEvents = new QueueEvents(EXECUTION_QUEUE_NAME, {
            connection: redisConnectionOptions,
        });
    }

    return executionQueueEvents;
}

export async function closeExecutionQueue() {
    if (executionQueueEvents) {
        await executionQueueEvents.close();
        executionQueueEvents = null;
    }

    if (executionQueue) {
        await executionQueue.close();
        executionQueue = null;
    }
}
