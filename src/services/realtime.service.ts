import { REDIS_CHANNELS } from "../configs/redis.config";
import { publishRealtimeEvent, closeRealtimeAdapter } from "../adapters/redis.adapter";
import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";

/**
 * Low-level realtime events publisher that delegates to the realtime adapter.
 *
 */

export async function publishExecutionLog(event: ExecutionLogEvent) {
    await publishRealtimeEvent(REDIS_CHANNELS.logs, event);
}
export async function publishExecutionStatus(event: ExecutionStatusEvent) {
    await publishRealtimeEvent(REDIS_CHANNELS.status, event);
}

export async function publishStopExecution(executionId: string) {
    await publishRealtimeEvent(REDIS_CHANNELS.control, {
        type: "stop-execution",
        executionId,
        timestamp: new Date().toISOString(),
    });
}

export async function closeRealtimePublisher() {
    await closeRealtimeAdapter();
}
