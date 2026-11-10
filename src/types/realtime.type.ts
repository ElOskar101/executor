import { ExecutionStatus } from "./execution.type";

export type RedisRealtimeChannel = "logs" | "status" | "metrics" | "row-audit-results" | "row-audit-errors";

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

export interface RowAuditResultEvent {
    rowId?: string;
    rowAuditId?: string;
    result?: unknown;
    error?: string;
}

export interface RowAuditErrorEvent {
    rowAuditId: string;
    jobId: string;
    reason: string;
    attemptsMade: number;
    timestamp: string;
}
