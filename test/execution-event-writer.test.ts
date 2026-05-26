import assert from "node:assert/strict";
import test from "node:test";

import { ExecutionModel } from "../src/models/execution.model";
import { createExecutionEventWriter } from "../src/services/execution-event-writer.service";

test("execution event writer persists running execution metadata", async (t) => {
  const calls: Array<{ id: string; update: unknown }> = [];
  const model = ExecutionModel as unknown as {
    findByIdAndUpdate: (id: string, update: unknown) => Promise<unknown>;
  };
  const originalFindByIdAndUpdate = model.findByIdAndUpdate;

  model.findByIdAndUpdate = (async (id, update) => {
    calls.push({ id, update });
    return null;
  }) as typeof model.findByIdAndUpdate;

  t.after(() => {
    model.findByIdAndUpdate = originalFindByIdAndUpdate;
  });

  const writer = createExecutionEventWriter("507f1f77bcf86cd799439011");
  await writer.markRunning({ pid: 1234, jobId: "job-1" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.id, "507f1f77bcf86cd799439011");

  const update = calls[0]?.update as {
    pid: number;
    status: string;
    startedAt: Date;
    jobId: string;
    playwrightExecutionId: string;
  };

  assert.equal(update.pid, 1234);
  assert.equal(update.status, "running");
  assert.equal(update.jobId, "job-1");
  assert.equal(update.playwrightExecutionId, "job-1");
  assert.ok(update.startedAt instanceof Date);
});

test("execution event writer persists failed and finished states with notes when needed", async (t) => {
  const calls: Array<{ id: string; update: unknown }> = [];
  const model = ExecutionModel as unknown as {
    findByIdAndUpdate: (id: string, update: unknown) => Promise<unknown>;
  };
  const originalFindByIdAndUpdate = model.findByIdAndUpdate;

  model.findByIdAndUpdate = (async (id, update) => {
    calls.push({ id, update });
    return null;
  }) as typeof model.findByIdAndUpdate;

  t.after(() => {
    model.findByIdAndUpdate = originalFindByIdAndUpdate;
  });

  const writer = createExecutionEventWriter("507f1f77bcf86cd799439011");
  await writer.markFailed("boom");
  await writer.markFinished({ status: "completed" });
  await writer.markFinished({ status: "failed", note: "Playwright exited with code 1" });

  assert.equal(calls.length, 3);

  const failedUpdate = calls[0]?.update as { $set: { status: string; finishedAt: Date }; $addToSet: { notes: string } };
  assert.equal(failedUpdate.$set.status, "failed");
  assert.ok(failedUpdate.$set.finishedAt instanceof Date);
  assert.equal(failedUpdate.$addToSet.notes, "boom");

  const completedUpdate = calls[1]?.update as { $set: { status: string; finishedAt: Date } };
  assert.equal(completedUpdate.$set.status, "completed");
  assert.ok(completedUpdate.$set.finishedAt instanceof Date);

  const finishedWithNoteUpdate = calls[2]?.update as { $set: { status: string; finishedAt: Date }; $addToSet: { notes: string } };
  assert.equal(finishedWithNoteUpdate.$set.status, "failed");
  assert.ok(finishedWithNoteUpdate.$set.finishedAt instanceof Date);
  assert.equal(finishedWithNoteUpdate.$addToSet.notes, "Playwright exited with code 1");
});

