import mongoose from "mongoose";
import { ExecutionModel } from "../models/execution.model";
import { LogModel } from "../models/log.model";
import { ExecutionStatus } from "../types/execution.type";

/**
 * MongoDB adapter for execution runtime persistence.
 * It currently stores both log chunks and execution state transitions.
 */

function isValidExecutionId(executionId: string) {
  return mongoose.Types.ObjectId.isValid(executionId);
}

/**
 * [LOG]: Append a chunk of execution log to the database
 * @param executionId
 * @param message
 */
export async function appendExecutionLog(executionId: string, message: string) {
  if (!message) return;
  if (!isValidExecutionId(executionId)) {
    throw new Error(`Invalid execution id for logs: ${executionId}`);
  }

  await LogModel.updateOne(
    { runId: executionId },
    {
      $setOnInsert: { runId: executionId },
      $push: { content: message },
    },
    { upsert: true },
  );
}

/**
 * [LOG]: Read the current state of the execution log and return it as a single string
 * @param executionId
 */
export async function readExecutionLog(executionId: string) {
  if (!isValidExecutionId(executionId)) {
    return "";
  }

  const result = await LogModel.findOne({ runId: executionId }).lean();
  if (!result) return "";

  if (Array.isArray(result.content)) {
    return result.content.join("");
  }

  return typeof result.content === "string" ? result.content : "";
}

type RunningExecutionUpdate = {
  executionId: string;
  pid?: number;
  jobId: string;
};

type FinishedExecutionUpdate = {
  executionId: string;
  status: ExecutionStatus;
  note?: string;
};

/**
 * [EXECUTION]: Mark the execution as running, with optional PID and jobId for tracking
 * @param param0
 * @param param0.executionId
 * @param param0.pid
 * @param param0.jobId
 */
export async function markExecutionRunning({ executionId, pid, jobId }: RunningExecutionUpdate) {
  await ExecutionModel.findByIdAndUpdate(executionId, {
    pid,
    status: "running" satisfies ExecutionStatus,
    startedAt: new Date(),
    jobId,
    playwrightExecutionId: jobId,
  });
}

/**
 * [EXECUTION]: Mark the execution as failed, with an optional note for context
 * @param executionId
 * @param note
 */
export async function markExecutionFailed(executionId: string, note: string) {
  await ExecutionModel.findByIdAndUpdate(executionId, {
    $set: {
      status: "failed" satisfies ExecutionStatus,
      finishedAt: new Date(),
    },
    $addToSet: {
      notes: note,
    },
  });
}

/**
 * [EXECUTION]: Mark the execution as finished, with an optional status and note for context
 * @param param0
 * @param param0.executionId
 * @param param0.status
 * @param param0.note
 */
export async function markExecutionFinished({ executionId, status, note }: FinishedExecutionUpdate) {
  const update = note
    ? {
        $set: { status, finishedAt: new Date() },
        $addToSet: { notes: note },
      }
    : {
        $set: { status, finishedAt: new Date() },
      };

  await ExecutionModel.findByIdAndUpdate(executionId, update);
}

