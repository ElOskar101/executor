import { Types } from "mongoose";

export type ExecutionStatus = 'queued' | 'running' | 'paused' | 'completed' | 'unknown' | 'cancelled' | 'failed' | 'scheduled';
export type ExecutionType = 'elg' | 'fbd';

export interface PatientPropertyDetail {
    key: string,
    value: string,
}

interface Patient { // Patient that would be tested in playwright
    id?: string
    patientName: PatientPropertyDetail,
    patientLastName: PatientPropertyDetail,
    patientMemberId: PatientPropertyDetail,
    patientDob: PatientPropertyDetail,
    policyHolderName: PatientPropertyDetail,
    policyHolderLastName: PatientPropertyDetail,
    policyHolderDob: PatientPropertyDetail,
    relationship: PatientPropertyDetail,
    zipCode: PatientPropertyDetail,
    verificationType: ExecutionType,
    filenames: [string],
    otherInformation: Record<string, unknown>
}

interface Bot {// Bot information that would be used for playwright execution
    botName: string,
    targetUrl: string,
    username: string,
    password: string,
    otherInformation: Record<string, unknown>
}

export interface CreateExecutionRequest {// Only for http request. It is basically the payload of the request (req.body)
    project: string;
    createdBy?: string;
    client?: string;
    clinic?: string;
    execution?: string;
    botName?: string;
    scheduledAt?: Date;
    context: Context;
}

export interface ExecutionJobData {
    executionId: string;
    project: string;
    workers: number;
    retries: number;
    headed: boolean;
    //playwrightFolder: string;
    context: Context;
}

export interface Context {
    bot: Bot,
    executionId?: string;
    patients: Array<Patient>,
    accessToken?: string,
    apiUrl?: string,
    config: Record<string, unknown>
    rv: Record<string, unknown>
    outputPath?: string,
    logsPath?: string,
    workers?: number,
    retries?: number,
    headed?: boolean,
}

export default interface Execution {
    _id: Types.ObjectId,
    // Execution properties only for record keeping (creation, update, runtime jobs)
    runId?: string,
    project: string,
    status: ExecutionStatus
    scheduledAt?: Date,
    startedAt?: Date,
    finishedAt?: Date,
    notes: string[],
    // Control properties for requesting filters (GETs, http requests after execution)
    createdBy?: string,
    client?: string,
    clinic?: string,
    execution?: string,
    botName?: string,
    // Playwright execution properties needed for playwright project runtime. It is like runtime context
    // (Runtime context for execution in playwright)
    context: Context
}
