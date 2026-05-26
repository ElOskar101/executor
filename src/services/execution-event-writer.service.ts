import {
  markExecutionFailed,
  markExecutionFinished,
  markExecutionRunning,
} from "../adapters/mongo.adapter";
import { ExecutionStatus } from "../types/execution.type";

export interface ExecutionEventWriter {
  markRunning(input: { pid?: number; jobId: string }): Promise<void>;
  markFailed(note: string): Promise<void>;
  markFinished(input: { status: ExecutionStatus; note?: string }): Promise<void>;
}

/**
 * Write-side port used by the worker to mark execution events.
 * The current default implementation persists events into MongoDB,
 * but it can be swapped by another adapter later.
 */

class MongoExecutionEventWriter implements ExecutionEventWriter {
  constructor(private readonly executionId: string) {}

  markRunning(input: { pid?: number; jobId: string }) {
    return markExecutionRunning({ executionId: this.executionId, ...input });
  }

  markFailed(note: string) {
    return markExecutionFailed(this.executionId, note);
  }

  markFinished(input: { status: ExecutionStatus; note?: string }) {
    return markExecutionFinished({ executionId: this.executionId, ...input });
  }
}

export function createExecutionEventWriter(executionId: string): ExecutionEventWriter {
  return new MongoExecutionEventWriter(executionId);
}

