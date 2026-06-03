import {ExecutionModel} from "../models/execution.model";
import Execution, { CreateExecutionRequest } from "../types/execution.type";
import {onBadRequest, onError, onNotFound, onSuccess} from "../libs/res-handler";
import {Request, Response} from "express";
import {
    createExecution as createQueuedExecution,
    createScheduledExecution as createQueuedScheduledExecution,
    getExecutionById,
    getExecutionWithLogs,
    listExecutions,
    pauseExecutionById,
    runScheduledExecutionNowById,
    resumeExecutionById,
    stopExecutionById
} from "../services/execution.service";
import { createLogger } from "../libs/logger";
import {createQuery} from "../libs/query-builder";

const logger = createLogger("api");

export const createExecution = async (req: Request, res: Response) => {
    try {
        const payload = req.body as CreateExecutionRequest;

        if (!payload.project) {
            return onBadRequest("Project is required", res);
        }
        logger.info(
            `User requested execution for project=${payload.project} patients=${payload.meta.patients.length}`,
        );
        const execution = await createQueuedExecution(payload);
        onSuccess(execution, res);
    } catch (e) {
        if (e instanceof Error && (e.message.includes("not allowed") || e.message.includes("not configured"))) {
            return onBadRequest(e.message, res);
        }

        onError(e, __filename, "createExecution", res);
    }
}

export const createScheduledExecution = async (req: Request, res: Response) => {
    try {
        const execution = await createQueuedScheduledExecution(req.body as CreateExecutionRequest & { scheduleAt?: string | Date });
        onSuccess(execution, res);
    } catch (e) {
        if (e instanceof Error && (e.message.includes("not allowed") || e.message.includes("not configured"))) {
            return onBadRequest(e.message, res);
        }

        onError(e, __filename, "createScheduledExecution", res);
    }
}

export const runScheduledExecutionNow = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const execution = await runScheduledExecutionNowById(id) as Execution | null;

        if (!execution) {
            return onNotFound("Execution not found", res);
        }

        onSuccess(execution, res);
    } catch (e) {
        onError(e, __filename, "runScheduledExecutionNow", res);
    }
}

export const getExecutions = async (req:Request, res:Response) => {
    try{
        const query = await createQuery(req.query);
        const limit  = Number (req.query.limit) || 999;
        logger.info(`Query executions: ${JSON.stringify(query)}`);
        const executions = await listExecutions(query, limit) as Execution[];
        onSuccess(executions, res);
    }catch (e) {
        onError(e, __filename, "getExecutions", res);
    }
}

export const getExecution = async (req:Request, res:Response) => {
    try{
        const { id } = req.params;
        const execution = await getExecutionWithLogs(id);

        if (!execution) {
            return onNotFound("Execution not found", res);
        }

        onSuccess(execution, res);
    }catch (e) {
        onError(e, __filename, "getExecution", res);
    }
}

export const stopExecution = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const execution = await getExecutionById(id);

        if (!execution) {
            return onNotFound("Execution not found", res);
        }

        if (execution.status === "completed" || execution.status === "failed" || execution.status === "cancelled") {
            return onBadRequest(`Execution is already ${execution.status}`, res);
        }

        const stoppedExecution = await stopExecutionById(id);
        onSuccess(stoppedExecution, res);
    } catch (e) {
        onError(e, __filename, "stopExecution", res);
    }
}

export const pauseExecution = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const execution = await getExecutionById(id);

        if (!execution) {
            return onNotFound("Execution not found", res);
        }

        if (execution.status !== "running") {
            return onBadRequest(`Execution cannot be paused while status is ${execution.status}`, res);
        }

        const pausedExecution = await pauseExecutionById(id);
        onSuccess(pausedExecution, res);
    } catch (e) {
        onError(e, __filename, "pauseExecution", res);
    }
}

export const resumeExecution = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const execution = await getExecutionById(id);

        if (!execution) {
            return onNotFound("Execution not found", res);
        }

        if (execution.status !== "paused") {
            return onBadRequest(`Execution cannot be resumed while status is ${execution.status}`, res);
        }

        const resumedExecution = await resumeExecutionById(id);
        onSuccess(resumedExecution, res);
    } catch (e) {
        onError(e, __filename, "resumeExecution", res);
    }
}

export const updateExecution = async (req: Request, res:Response) => {
    try{
        const { id } = req.params;
        const payload = req.body as Execution;
        const result = await _updateExecution(id, payload) as Execution;
        onSuccess(result, res);
    }catch (e) {
        onError(e, __filename, "updateExecution", res);
    }
}

export const deleteExecution = async (req: Request, res:Response) => {
    try{
        const { id } = req.params;
        const result = await ExecutionModel.findById(id).lean() as Execution || null;
        if (!result) return onNotFound("Execution not found", res);
        if (result.status === 'running') return onBadRequest("Execution is still running", res);

        await ExecutionModel.findByIdAndDelete(id);
        onSuccess(result, res);

    }catch (e) {
        onError(e, __filename, "deleteExecution", res);
    }
}

export async function _updateExecution(id:string, payload: Execution) {
    return ExecutionModel.findByIdAndUpdate(id, payload, {new: true}).lean();
}
