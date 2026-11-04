import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "express";

import { createRowAudit as createRowAuditController } from "../src/controllers/row-audit.controller";
import { RowAuditModel } from "../src/models/row-audit.model";
import * as rowAuditQueue from "../src/queues/row-audit.queue";
import * as rowAuditService from "../src/services/row-audit.service";
import { PdfAuditPayload } from "../src/types/row-audit.type";

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
    t.mock.method(RowAuditModel, "create", async () => new RowAuditModel(payload));
    t.mock.method(rowAuditQueue, "getRowAuditQueue", () => ({
        add: async () => { throw error; },
    }));

    await assert.rejects(rowAuditService.createRowAudit(payload), error);
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
