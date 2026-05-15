import { ExecutionStatus } from "./execution.type";

export type RedisRealtimeChannel = "logs" | "status" | "metrics";

export interface ExecutionLogEvent {
    executionId: string;
    jobId?: string;
    stream: "stdout" | "stderr" | "system";
    message: string;
    timestamp: string;
}

export interface ExecutionStatusEvent {
    executionId: string;
    jobId?: string;
    status: ExecutionStatus;
    pid?: number;
    exitCode?: number | null;
    error?: string;
    timestamp: string;
}

export interface ExecutionMetricsEvent {
    workerId: string;
    activeExecutions: number;
    timestamp: string;
}
