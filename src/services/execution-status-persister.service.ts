import { ExecutionStatusEvent } from "../types/realtime.type";
import { markExecutionRunning, markExecutionFinished } from "../adapters/mongo.adapter";

/**
 * Consumer that persists execution status events received from Redis (emitted by runner).
 * Called by socket-server when status events arrive.
 */

export interface ExecutionStatusPersister {
  handleStatusEvent(event: ExecutionStatusEvent): Promise<void>;
}

class MongoExecutionStatusPersister implements ExecutionStatusPersister {
  async handleStatusEvent(event: ExecutionStatusEvent) {
    const { executionId, status, pid, exitCode, error } = event;

    if (status === "running") {
      // Emit from runner when execution starts
      await markExecutionRunning({
        executionId,
        pid,
        jobId: event.jobId || executionId,
      });
    } else if (status === "completed" || status === "cancelled" || status === "failed") {
      // Emit from runner when execution ends
      await markExecutionFinished({
        executionId,
        status,
        note: error,
      });
    }
    // "paused" status: optional, can be added later if needed for Mongo persistence
  }
}

export function createExecutionStatusPersister(): ExecutionStatusPersister {
  return new MongoExecutionStatusPersister();
}

