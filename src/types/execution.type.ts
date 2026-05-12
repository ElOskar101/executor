import {Types} from "mongoose";

export default interface Execution {
    _id: Types.ObjectId;
    pid: number;
    createdBy?: string;
    status: 'running' | 'stopped' | 'error' | 'unknown' | 'cancelled';
    startedAt?: Date;
    finishedAt?: Date;
    error?: string;
    note?: string[];
    attachments?: string[];
    output?: string;
    clientId?: string;
    clinicId?: string;
    executionId?: string;
    botId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}