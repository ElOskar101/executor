import { ExecutionLogEvent } from "../types/realtime.type";
import { appendExecutionLog } from "../adapters/mongo.adapter";

/**
 * Consumer that persists execution log events received from Redis (emitted by runner).
 * Called by socket-server when log events arrive.
 */

export interface ExecutionLogPersister {
  handleLogEvent(event: ExecutionLogEvent): Promise<void>;
}

class MongoExecutionLogPersister implements ExecutionLogPersister {
  async handleLogEvent(event: ExecutionLogEvent) {
    const { executionId, stream, message } = event;

    // Format the log message with timestamp and stream info
    const formattedMessage = `[${event.timestamp}] [${stream}] ${message}`;

    // Persist to Mongo
    await appendExecutionLog(executionId, formattedMessage);
  }
}

export function createExecutionLogPersister(): ExecutionLogPersister {
  return new MongoExecutionLogPersister();
}

