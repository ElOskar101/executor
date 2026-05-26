import assert from "node:assert/strict";
import test from "node:test";

import { LogModel } from "../src/models/log.model";
import { createExecutionLogSink } from "../src/services/execution-log-writer.service";
import { readExecutionLog } from "../src/adapters/mongo.adapter";

test("mongo execution log sink appends chunks and reads them back as a single string", async (t) => {
  const validExecutionId = "507f1f77bcf86cd799439011";
  const store = new Map<string, string[]>();
  const model = LogModel as unknown as {
    updateOne: (...args: unknown[]) => Promise<unknown>;
    findOne: (...args: unknown[]) => { lean: () => Promise<unknown> };
  };

  const originalUpdateOne = model.updateOne;
  const originalFindOne = model.findOne;

  model.updateOne = (async (filter, update) => {
    const executionId = String((filter as { runId: string }).runId);
    const chunks = [...(store.get(executionId) || [])];
    const pushedContent = (update as { $push?: { content?: string } }).$push?.content;

    if (typeof pushedContent === "string") {
      chunks.push(pushedContent);
    }

    store.set(executionId, chunks);
    return { acknowledged: true };
  }) as typeof model.updateOne;

  model.findOne = (((filter: { runId: string }) => ({
    lean: async () => {
      const chunks = store.get(String(filter.runId));
      return chunks ? { runId: filter.runId, content: chunks } : null;
    },
  })) as unknown) as typeof model.findOne;

  t.after(() => {
    model.updateOne = originalUpdateOne;
    model.findOne = originalFindOne;
  });

  const sink = createExecutionLogSink(validExecutionId);
  await sink.append("hello");
  await sink.append(" world");
  await sink.close();

  const content = await readExecutionLog(validExecutionId);
  assert.equal(content, "hello world");
});

test("readExecutionLog returns empty string for an invalid execution id", async () => {
  const content = await readExecutionLog("not-an-object-id");
  assert.equal(content, "");
});

