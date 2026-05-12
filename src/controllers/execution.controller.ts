import {ExecutionModel} from "../models/execution.model";
import Execution from "../types/execution.type";
import {onError, onSuccess} from "../libs/res-handler";
import {Request, Response} from "express";

export const createExecution = async (payload: Execution) => {
    try{
        await ExecutionModel.create(payload);
    }catch (e) {
        throw e
    }
}

export const getExecutions = async (req:Request, res:Response) => {
    try{
        const executions = await ExecutionModel.find({}).lean() as Execution[];
        onSuccess(executions, res);
    }catch (e) {
        onError(e, __filename, "getExecutions", res);
    }
}

export const getExecution = async () => {
    try{

    }catch (e) {

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

export const deleteExecution = async () => {
    try{

    }catch (e) {

    }
}

export async function _updateExecution(id:string, payload: Execution) {
    return ExecutionModel.findByIdAndUpdate(id, payload, {new: true}).lean();
}