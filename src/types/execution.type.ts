import { Types } from "mongoose";

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'unknown' | 'cancelled' | 'failed';
export type PlaywrightMode = 'serial' | 'default' | 'parallel' | undefined;
export type ExecutionType = 'elg' | 'fbd';

interface Patient { // Patient that would be tested in playwright
    patientName: string,
    patientLastName: string,
    patientMemberId: string,
    patientDob: string,
    policyHolderName: string,
    policyHolderLastName: string,
    policyHolderDob: string,
    relationship: string,
    zipCode: string,
    clinic: string,
    verificationType: ExecutionType,
    filenames: string,
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
    meta: {
        bot: Bot,
        patients: Array<Patient>,
        config: Record<string, unknown>
        rv: Record<string, unknown>
        outputPath?: string,
        logsPath?: string,
        workers?: number,
        retries?: number,
        headed?: boolean,
        playwrightMode?: PlaywrightMode,
    };
}

export interface ExecutionJobData {
    executionId: string;
    project: string;
    workers: number;
    retries: number;
    headed: boolean;
    playwrightMode?: PlaywrightMode;
    playwrightFolder: string;
}

export default interface Execution {
    _id: Types.ObjectId,
    // Execution properties only for record keeping (creation, update, runtime jobs)
    runId: string,
    playwrightProject: string,
    status: ExecutionStatus
    startedAt: Date,
    finishedAt: Date,
    notes: string[],
    // Control properties for requesting filters (GETs, http requests after execution)
    createdBy: string,
    client: string,
    clinic: string,
    execution: string,
    botName: string,
    // Playwright execution properties needed for playwright project runtime. It is like runtime context
    // (Runtime context for execution in playwright)
    meta:{
        bot: Bot,
        patients: Array<Patient>,
        config: Record<string, unknown>
        rv: Record<string, unknown>
        outputPath?: string,
        logsPath?: string,
        workers?: number,
        retries?: number,
        playwrightMode?: PlaywrightMode,
        headed?: boolean,
    }
}
