import { createRedisConnection, REDIS_CHANNELS } from "../configs/redis.config";
import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";

let publisher: ReturnType<typeof createRedisConnection> | null = null;

function getPublisher() {
    if (!publisher) {
        publisher = createRedisConnection();
    }

    return publisher;
}

export async function publishExecutionLog(event: ExecutionLogEvent) {
    await getPublisher().publish(REDIS_CHANNELS.logs, JSON.stringify(event));
}

export async function publishExecutionStatus(event: ExecutionStatusEvent) {
    await getPublisher().publish(REDIS_CHANNELS.status, JSON.stringify(event));
}

export async function publishStopExecution(executionId: string) {
    await getPublisher().publish(REDIS_CHANNELS.control, JSON.stringify({
        type: "stop-execution",
        executionId,
        timestamp: new Date().toISOString(),
    }));
}

export async function closeRealtimePublisher() {
    publisher?.disconnect();
    publisher = null;
}
