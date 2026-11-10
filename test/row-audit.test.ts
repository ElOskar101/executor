import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import express, { Request, Response } from "express";
import request from "supertest";

import { createRowAudit as createRowAuditController } from "../src/controllers/row-audit.controller";
import { RowAuditModel } from "../src/models/row-audit.model";
import * as rowAuditQueue from "../src/queues/row-audit.queue";
import * as rowAuditService from "../src/services/row-audit.service";
import { PdfAuditPayload } from "../src/types/row-audit.type";
import rowAuditRoute from "../src/routes/row-audit.route";

const payload: PdfAuditPayload = {
    row: {
        audited: "pending", loaded: true, executed: true, readyToReview: false,
        executionStatus: "completed", storedFiles: ["report.pdf"],
        formPayload: { nested: { value: 1 } }, bot: "audit-bot",
        cells: [{
            patientName: "Jane", patientLastName: "Doe", patientDob: "1990-01-01",
            memberId: "123", verificationType: "eob", subscriberFirstName: "Jane",
            subscriberLastName: "Doe", subscriberDob: "1990-01-01", relationship: "self",
        }],
    },
    template: { fields: ["name"] }, options: { threshold: 0.8 },
};

test("row audit service saves the payload and enqueues it with the record ID", async (t) => {
    const document = new RowAuditModel(payload);
    const create = t.mock.method(RowAuditModel, "create", async () => document);
    const add = t.mock.fn(async () => ({ id: document.id }));
    t.mock.method(rowAuditQueue, "getRowAuditQueue", () => ({ add }));

    const result = await rowAuditService.createRowAudit(payload);

    assert.deepEqual(create.mock.calls[0].arguments, [payload]);
    assert.deepEqual(add.mock.calls[0].arguments, [
        "run-row-audit", { rowAuditId: document.id, ...payload }, { jobId: document.id },
    ]);
    assert.deepEqual(result, document.toObject());
    assert.equal(result.status, "queued");
});

test("row audit stores the source _id as rowId and keeps the incoming job payload", async (t) => {
    const identifiedPayload = { ...payload, row: { ...payload.row, _id: "source-row-123" } };
    const originalPayload = structuredClone(identifiedPayload);
    t.mock.method(RowAuditModel, "create", async (data: Record<string, unknown>) => {
        const document = new RowAuditModel(data);
        assert.equal(document.validateSync(), undefined);
        return document;
    });
    const add = t.mock.fn(async () => ({ id: "queued-job" }));
    t.mock.method(rowAuditQueue, "getRowAuditQueue", () => ({ add }));

    const result = await rowAuditService.createRowAudit(identifiedPayload);

    assert.equal(result.row.rowId, "source-row-123");
    assert.equal("_id" in result.row, false);
    assert.ok(result._id);
    assert.notEqual(result._id.toString(), "source-row-123");
    assert.deepEqual(identifiedPayload, originalPayload);
    assert.deepEqual(add.mock.calls[0].arguments, [
        "run-row-audit", { rowAuditId: result._id.toString(), ...identifiedPayload }, { jobId: result._id.toString() },
    ]);
});

test("row audit service does not enqueue when saving fails", async (t) => {
    const error = new Error("Mongo unavailable");
    t.mock.method(RowAuditModel, "create", async () => { throw error; });
    const getQueue = t.mock.method(rowAuditQueue, "getRowAuditQueue");

    await assert.rejects(rowAuditService.createRowAudit(payload), error);
    assert.equal(getQueue.mock.callCount(), 0);
});

test("row audit service propagates enqueue failures", async (t) => {
    const error = new Error("Redis unavailable");
    const document = new RowAuditModel(payload);
    t.mock.method(RowAuditModel, "create", async () => document);
    t.mock.method(rowAuditQueue, "getRowAuditQueue", () => ({
        add: async () => { throw error; },
    }));

    await assert.rejects(rowAuditService.createRowAudit(payload), error);
});

test("queue active events persist running status only for queued audits", async (t) => {
    const events = Object.assign(new EventEmitter(), { close: t.mock.fn(async () => {}) });
    t.mock.method(require("bullmq/dist/cjs/classes/queue-events"), "QueueEvents", function () {
        return events;
    });
    const update = t.mock.method(RowAuditModel, "findOneAndUpdate", () => ({ lean: async () => null }));
    const queueEvents = rowAuditQueue.getRowAuditQueueEvents();
    t.after(() => rowAuditQueue.closeRowAuditQueue());

    await queueEvents.listeners("active")[0]({ jobId: "audit-123" });

    assert.deepEqual(update.mock.calls[0].arguments, [
        { _id: "audit-123", status: "queued" }, { status: "running" }, { new: true },
    ]);
});

function responseStub() {
    return {
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; },
        send(body: unknown) { this.body = body; return this; },
    };
}

test("row audit controller returns the record from the service", async (t) => {
    const record = new RowAuditModel(payload).toObject();
    const create = t.mock.method(rowAuditService, "createRowAudit", async () => record);
    const res = responseStub();

    await createRowAuditController({ body: payload } as Request, res as unknown as Response);

    assert.deepEqual(create.mock.calls[0].arguments, [payload]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, record);
});

test("row audit controller rejects missing payload fields without calling the service", async (t) => {
    const create = t.mock.method(rowAuditService, "createRowAudit");
    const res = responseStub();

    await createRowAuditController({ body: {} } as Request, res as unknown as Response);

    assert.equal(res.statusCode, 400);
    assert.equal(create.mock.callCount(), 0);
});

test("row audit controller returns 400 for schema validation errors", async (t) => {
    const error = new RowAuditModel({}).validateSync()!;
    t.mock.method(rowAuditService, "createRowAudit", async () => { throw error; });
    const res = responseStub();

    await createRowAuditController({ body: payload } as Request, res as unknown as Response);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: error.message });
});

test("POST /row-audit remains available without a source row ID", async (t) => {
    const record = new RowAuditModel(payload).toObject();
    const create = t.mock.method(rowAuditService, "createRowAudit", async () => record);
    const app = express();
    app.use(express.json(), rowAuditRoute);

    const response = await request(app).post("/row-audit").send(payload);

    assert.equal(response.status, 200);
    assert.equal(response.body._id, record._id.toString());
    assert.deepEqual(create.mock.calls[0].arguments, [payload]);
});
