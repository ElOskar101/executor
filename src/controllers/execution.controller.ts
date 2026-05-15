import {ExecutionModel} from "../models/execution.model";
import Execution, { CreateExecutionRequest } from "../types/execution.type";
import {onBadRequest, onError, onNotFound, onSuccess} from "../libs/res-handler";
import {Request, Response} from "express";
import {
    createExecution as createQueuedExecution,
    getExecutionById,
    getExecutionWithLogs,
    listExecutions,
    stopExecutionById
} from "../services/execution.service";

export const createExecutionRecord = async (payload: Execution) => {
    try{
        await ExecutionModel.create(payload);
    }catch (e) {
        throw e
    }
}

export const createExecution = async (req: Request, res: Response) => {
    try {
        const payload = req.body as CreateExecutionRequest;

        if (!payload.project) {
            return onBadRequest("project is required", res);
        }

        const execution = await createQueuedExecution(payload);
        onSuccess(execution, res);
    } catch (e) {
        if (e instanceof Error && (e.message.includes("not allowed") || e.message.includes("not configured"))) {
            return onBadRequest(e.message, res);
        }

        onError(e, __filename, "createExecution", res);
    }
}

export const getExecutions = async (req:Request, res:Response) => {
    try{
        const executions = await listExecutions() as Execution[];
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
