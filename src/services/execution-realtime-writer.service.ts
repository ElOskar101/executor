import { publishExecutionLog, publishExecutionStatus } from "./realtime.service";
import { ExecutionStatus } from "../types/execution.type";
import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";

/**
 * Higher-level service for writing realtime execution logs and status updates.
 * This service abstracts away the underlying realtime adapter and provides a simple interface for execution workers to publish logs and status updates.
 * It automatically includes the executionId and optional jobId from the context, so workers only need to provide the log message or status details.
 * The timestamps are generated at the time of publishing, ensuring accurate event timing.
 */

type RealtimeWriterContext = {
  executionId: string;
  jobId?: string;
};

type LogInput = Omit<ExecutionLogEvent, "executionId" | "jobId" | "timestamp"> & {
  jobId?: string;
};

type StatusInput = Omit<ExecutionStatusEvent, "executionId" | "jobId" | "timestamp"> & {
  jobId?: string;
  status: ExecutionStatus;
};

export interface ExecutionRealtimeWriter {
  publishLog(input: LogInput): Promise<void>;
  publishStatus(input: StatusInput): Promise<void>;
}

function now() {
  return new Date().toISOString();
}

class RedisExecutionRealtimeWriter implements ExecutionRealtimeWriter {
  constructor(private readonly context: RealtimeWriterContext) {}

  async publishLog(input: LogInput) {
    await publishExecutionLog({
      executionId: this.context.executionId,
      jobId: input.jobId ?? this.context.jobId,
      stream: input.stream,
      message: input.message,
      timestamp: now(),
    });
  }

  async publishStatus(input: StatusInput) {
    await publishExecutionStatus({
      executionId: this.context.executionId,
      jobId: input.jobId ?? this.context.jobId,
      status: input.status,
      pid: input.pid,
      exitCode: input.exitCode,
      error: input.error,
      timestamp: now(),
    });
  }
}

export function createExecutionRealtimeWriter(context: RealtimeWriterContext): ExecutionRealtimeWriter {
  return new RedisExecutionRealtimeWriter(context);
}

