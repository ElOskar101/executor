import { appendExecutionLog } from "../adapters/mongo.adapter";

/**
 * Write-side port used by the worker to append execution logs.
 * The current default implementation persists logs into MongoDB,
 * but it can be swapped by another adapter later.
 */
export interface ExecutionLogSink {
  append(message: string): Promise<void>;
  close(): Promise<void>;
}

class MongoExecutionLogSink implements ExecutionLogSink {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(private readonly executionId: string) {}

  append(message: string) {
    const writeOperation = this.pendingWrite.then(() => appendExecutionLog(this.executionId, message));
    this.pendingWrite = writeOperation.catch(() => undefined);
    return writeOperation;
  }

  async close() {
    await this.pendingWrite;
  }
}

export function createExecutionLogSink(executionId: string): ExecutionLogSink {
  return new MongoExecutionLogSink(executionId);
}

