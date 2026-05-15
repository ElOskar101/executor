import {Types} from "mongoose";

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'error' | 'unknown' | 'cancelled' | 'failed';

export interface CreateExecutionRequest {
    project: string;
    workers?: number;
    retries?: number;
    headed?: boolean;
    createdBy?: string;
    client?: string;
    clinic?: string;
    execution?: string;
    bot?: string;
}

export interface ExecutionJobData {
    executionId: string;
    project: string;
    workers: number;
    retries: number;
    headed: boolean;
    playwrightFolder: string;
}

export default interface Execution {
    _id: Types.ObjectId;
    jobId?: string;
    pid?: number;
    createdBy?: string;
    playwrightProject?: string;
    playwrightExecutionId?: string;
    status: ExecutionStatus;
    startedAt?: Date;
    finishedAt?: Date;
    error?: string;
    note?: string[];
    attachments?: string[];
    output?: string;
    client?: string;
    clinic?: string;
    execution?: string;
    bot?: string;
    createdAt?: Date;
    updatedAt?: Date;
}
