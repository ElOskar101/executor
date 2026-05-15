import { Request, Response } from 'express';
import {onError, onSuccess, onBadRequest} from "../libs/res-handler";
import { RunOptions, stopPlaywrightExecution } from "../libs/command-executor";
import { createExecution as createQueuedExecution, stopExecutionById } from "../services/execution.service";

export const runProject = async (req: Request, res: Response) => {
  try{
    const { project } = req.params;
    const {workers=1, retries=0, headed=false} = req.body as RunOptions;

    const execution = await createQueuedExecution({ project, workers, retries, headed });
    onSuccess(execution, res);
  }catch (e) {
    if (e instanceof Error && (e.message.includes("not allowed") || e.message.includes("not configured"))) {
      return onBadRequest(e.message, res);
    }

    onError(e, __filename, "runBot", res);
  }
}

export const stopExecution = async (req: Request, res: Response) => {
  try{
    const {serviceId} = req.params;
    if (/^[0-9a-fA-F]{24}$/.test(serviceId)) {
      await stopExecutionById(serviceId);
    } else {
      stopPlaywrightExecution(serviceId);
    }
    onSuccess({ message: `Bot execution stopped for serviceId: ${serviceId}` }, res);
  }catch (e) {
    onError(e, __filename, "stopExecution", res);
  }
}

export const showLastExecution = async (req: Request, res: Response) => {
  try{

  }catch (e) {
    onError(e, __filename, "showLastExecution", res);
  }
}
