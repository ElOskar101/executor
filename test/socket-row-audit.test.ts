import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import test, { TestContext } from "node:test";
import { Socket } from "socket.io";

import * as redisConfig from "../src/configs/redis.config";
import * as redisAdapter from "../src/adapters/redis.adapter";
import { RowAuditModel } from "../src/models/row-audit.model";
import * as rowAuditQueue from "../src/queues/row-audit.queue";
import * as rowAuditService from "../src/services/row-audit.service";
import { publishRowAuditResult } from "../src/services/realtime.service";
import { setupSocketServer, closeSocketServer } from "../src/services/socket-server.service";
import { PdfAuditPayload } from "../src/types/row-audit.type";

const payload: PdfAuditPayload = {
    row: {
        _id: "source-row-123",
        audited: "pending", loaded: true, executed: true, readyToReview: false,
        executionStatus: "completed", storedFiles: ["report.pdf"],
        formPayload: {}, bot: "audit-bot",
        cells: [{
            patientName: "Jane", patientLastName: "Doe", patientDob: "1990-01-01",
            memberId: "123", verificationType: "eob", subscriberFirstName: "Jane",
            subscriberLastName: "Doe", subscriberDob: "1990-01-01", relationship: "self",
        }],
    },
    template: {}, options: { threshold: 0.8 },
};

async function setup(t: TestContext) {
    const subscriber = Object.assign(new EventEmitter(), {
        subscribe: t.mock.fn(async (..._channels: string[]) => {}),
        disconnect: t.mock.fn(),
    });
    t.mock.method(redisConfig, "createRedisConnection", () => subscriber);
    const io = await setupSocketServer(createServer());
    t.after(() => closeSocketServer());

    // Dispatch through the registered handlers without needing Redis or a network client.
    const socket = Object.assign(new EventEmitter(), { disconnect: () => {} });
    for (const onConnection of io.sockets.listeners("connection")) onConnection(socket as unknown as Socket);
    io.sockets.sockets.set("test-client", socket as unknown as Socket);
    const onAudit = socket.listeners("execution:row:audit")[0];
    const onMessage = subscriber.listeners("message")[0];
    assert.ok(onAudit);
    assert.ok(onMessage);
    return { io, subscriber, onAudit, onMessage };
}

function mockAuditBroadcast(t: TestContext, io: Awaited<ReturnType<typeof setupSocketServer>>) {
    const emit = t.mock.fn((
        _event: string,
        _payload: unknown,
        acknowledge: (error: Error | null, responses: Array<{ ok?: boolean }>) => void,
    ) => {
        acknowledge(null, [{ ok: true }]);
    });
    const timeout = t.mock.method(io, "timeout", () => ({ emit } as unknown as ReturnType<typeof io.timeout>));
    const info = t.mock.method(console, "info", () => {});
    return { emit, timeout, info };
}

test("socket audit uses the existing save/queue flow and acknowledges the row IDs", async (t) => {
    const { onAudit } = await setup(t);
    const document = new RowAuditModel(payload);
    t.mock.method(RowAuditModel, "create", async () => document);
    const add = t.mock.fn(async () => ({ id: document.id }));
    t.mock.method(rowAuditQueue, "getRowAuditQueue", () => ({ add }));
    const acknowledge = t.mock.fn();

    await onAudit(payload, acknowledge);

    assert.deepEqual(add.mock.calls[0].arguments, [
        "run-row-audit", {
            rowAuditId: document.id, _id: payload.row._id,
            ...payload, config: payload.options,
        }, { jobId: document.id },
    ]);
    assert.deepEqual(acknowledge.mock.calls[0].arguments, [{
        ok: true, rowId: payload.row._id, rowAuditId: document.id,
    }]);
});

test("socket audit rejects missing fields and source row IDs before queueing", async (t) => {
    const { onAudit } = await setup(t);
    const create = t.mock.method(rowAuditService, "createRowAudit");
    t.mock.method(console, "error", () => {});

    for (const invalid of [undefined, {}, { row: payload.row }, { ...payload, row: { ...payload.row, _id: "" } }]) {
        const acknowledge = t.mock.fn();
        await onAudit(invalid, acknowledge);
        const response = acknowledge.mock.calls[0].arguments[0];
        assert.equal(response.ok, false);
        assert.equal(typeof response.error, "string");
    }
    assert.equal(create.mock.callCount(), 0);
});

test("socket audit reports queue failures instead of acknowledging success", async (t) => {
    const { onAudit } = await setup(t);
    t.mock.method(RowAuditModel, "create", async () => new RowAuditModel(payload));
    t.mock.method(rowAuditQueue, "getRowAuditQueue", () => ({
        add: async () => { throw new Error("Redis unavailable"); },
    }));
    t.mock.method(console, "error", () => {});
    const acknowledge = t.mock.fn();

    await onAudit(payload, acknowledge);

    assert.deepEqual(acknowledge.mock.calls[0].arguments, [{ ok: false, error: "Redis unavailable" }]);
});

test("socket audit accepts requests without an acknowledgement callback", async (t) => {
    const { onAudit } = await setup(t);
    const create = t.mock.method(rowAuditService, "createRowAudit", async () => new RowAuditModel(payload).toObject());

    await onAudit(payload);

    assert.equal(create.mock.callCount(), 1);
});

test("Redis audit results are broadcast without rooms, including results with an execution ID", async (t) => {
    const { io, subscriber, onMessage } = await setup(t);
    const { emit, timeout, info } = mockAuditBroadcast(t, io);
    const to = t.mock.method(io, "to", () => { throw new Error("Audit results must not use rooms"); });
    const publish = t.mock.method(redisAdapter, "publishRealtimeEvent", async (
        channel: Parameters<typeof redisAdapter.publishRealtimeEvent>[0], event: unknown,
    ) => {
        await onMessage(channel, JSON.stringify(event));
    });
    const event = {
        rowId: "source-row-123", rowAuditId: "audit-123", executionId: "execution-123",
        result: { passed: true },
    };
    const update = t.mock.method(RowAuditModel, "findByIdAndUpdate", () => ({
        lean: async () => {
            assert.equal(emit.mock.callCount(), 0, "persist before broadcasting");
            return { row: { rowId: "source-row-123" }, status: "done" };
        },
    }));

    await publishRowAuditResult(event);

    assert.ok(subscriber.subscribe.mock.calls[0].arguments.includes("row-audit-results"));
    assert.deepEqual(timeout.mock.calls[0].arguments, [5000]);
    assert.deepEqual(publish.mock.calls[0].arguments, ["row-audit-results", event]);
    assert.equal(update.mock.calls[0].arguments[0], event.rowAuditId);
    const change = update.mock.calls[0].arguments[1];
    assert.deepEqual(change, { status: "done" });
    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", { ...event, status: "done" }]);
    assert.equal(info.mock.callCount(), 1);
    assert.equal(to.mock.callCount(), 0);
});

test("Redis results without an audit ID are forwarded and unidentifiable results are ignored", async (t) => {
    const { io, onMessage } = await setup(t);
    const { emit } = mockAuditBroadcast(t, io);
    const warn = t.mock.method(console, "warn", () => {});
    const result = { rowId: "source-row-123", result: { passed: true } };

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, JSON.stringify(result));
    for (const message of ["invalid JSON", "null", "{}", '{"rowId":""}']) {
        await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, message);
    }

    assert.equal(emit.mock.callCount(), 1);
    assert.equal(warn.mock.callCount(), 4);
    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", { ...result, status: "done" }]);
});

test("row-audit-errors sets failed and forwards the error with its source row ID", async (t) => {
    const { io, subscriber, onMessage } = await setup(t);
    const { emit } = mockAuditBroadcast(t, io);
    const to = t.mock.method(io, "to", () => { throw new Error("Errors must not use rooms"); });
    const failure = {
        rowAuditId: "audit-123", jobId: "123",
        reason: "Document validation API returned HTTP 503.",
        attemptsMade: 3, timestamp: "2026-11-09T12:00:00.000Z",
    };
    const update = t.mock.method(RowAuditModel, "findByIdAndUpdate", () => ({
        lean: async () => {
            assert.equal(emit.mock.callCount(), 0);
            return { row: { rowId: "source-row-123" }, status: "failed" };
        },
    }));
    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditErrors, JSON.stringify(failure));

    assert.ok(subscriber.subscribe.mock.calls[0].arguments.includes("row-audit-errors"));
    assert.deepEqual(update.mock.calls[0].arguments, [failure.rowAuditId, { status: "failed" }, { new: true }]);
    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", {
        ...failure, rowId: "source-row-123", status: "failed",
    }]);
    assert.equal(to.mock.callCount(), 0);
});

test("row-audit-errors uses the BullMQ job ID when the runner omits rowAuditId", async (t) => {
    const { io, onMessage } = await setup(t);
    const { emit } = mockAuditBroadcast(t, io);
    const error = { jobId: "507f191e810c19729de860ea", reason: "HTTP 503" };
    const update = t.mock.method(RowAuditModel, "findByIdAndUpdate", () => ({
        lean: async () => ({ row: { rowId: "source-row-123" }, status: "failed" }),
    }));

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditErrors, JSON.stringify(error));

    assert.equal(update.mock.calls[0].arguments[0], error.jobId);
    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", {
        ...error, rowAuditId: error.jobId, rowId: "source-row-123", status: "failed",
    }]);
});

test("row-audit-errors falls back to the job ID when rowAuditId is the source row ID", async (t) => {
    const { io, onMessage } = await setup(t);
    const { emit } = mockAuditBroadcast(t, io);
    const error = { rowAuditId: "507f191e810c19729de860eb", jobId: "507f191e810c19729de860ea", reason: "HTTP 503" };
    const update = t.mock.method(RowAuditModel, "findByIdAndUpdate", (id: string) => ({
        lean: async () => id === error.jobId ? { row: { rowId: error.rowAuditId }, status: "failed" } : null,
    }));

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditErrors, JSON.stringify(error));

    assert.deepEqual(update.mock.calls.map((call) => call.arguments[0]), [error.rowAuditId, error.jobId]);
    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", {
        ...error, rowAuditId: error.jobId, rowId: error.rowAuditId, status: "failed",
    }]);
});

test("row-audit-errors still falls back when the source row ID is not a Mongo ID", async (t) => {
    const { io, onMessage } = await setup(t);
    const { emit } = mockAuditBroadcast(t, io);
    const warn = t.mock.method(console, "warn", () => {});
    const error = { rowAuditId: "source-row-123", jobId: "507f191e810c19729de860ea", reason: "HTTP 503" };
    const update = t.mock.method(RowAuditModel, "findByIdAndUpdate", (id: string) => {
        if (id === error.rowAuditId) throw new Error("CastError");
        return { lean: async () => ({ row: { rowId: error.rowAuditId }, status: "failed" }) };
    });

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditErrors, JSON.stringify(error));

    assert.deepEqual(update.mock.calls.map((call) => call.arguments[0]), [error.rowAuditId, error.jobId]);
    assert.equal(warn.mock.callCount(), 1);
    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", {
        ...error, rowAuditId: error.jobId, rowId: error.rowAuditId, status: "failed",
    }]);
});

test("audit results still broadcast if Mongo persistence fails", async (t) => {
    const { io, onMessage } = await setup(t);
    const { emit } = mockAuditBroadcast(t, io);
    t.mock.method(console, "error", () => {});
    t.mock.method(RowAuditModel, "findByIdAndUpdate", () => { throw new Error("Mongo unavailable"); });
    const event = { rowId: "source-row-123", rowAuditId: "audit-123", result: { passed: true } };

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, JSON.stringify(event));

    assert.deepEqual(emit.mock.calls[0].arguments.slice(0, 2), ["execution:row:audit-result", { ...event, status: "done" }]);
});

test("audit result reports when no client is connected", async (t) => {
    const { io, onMessage } = await setup(t);
    io.sockets.sockets.clear();
    const { emit } = mockAuditBroadcast(t, io);
    const warn = t.mock.method(console, "warn", () => {});

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, JSON.stringify({ rowId: "source-row-123" }));

    assert.equal(emit.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 1);
});

test("audit result reports missing and negative client acknowledgements", async (t) => {
    const { io, onMessage } = await setup(t);
    const logError = t.mock.method(console, "error", () => {});
    const emit = t.mock.fn((
        _event: string,
        _payload: unknown,
        acknowledge: (error: Error | null, responses: Array<{ ok?: boolean }>) => void,
    ) => acknowledge(new Error("timeout"), []));
    t.mock.method(io, "timeout", () => ({ emit } as unknown as ReturnType<typeof io.timeout>));
    const message = JSON.stringify({ rowId: "source-row-123" });

    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, message);
    assert.equal(logError.mock.callCount(), 1);

    emit.mock.mockImplementation((_event, _payload, acknowledge) => acknowledge(null, [{ ok: false }]));
    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, message);
    assert.equal(logError.mock.callCount(), 2);

    emit.mock.mockImplementation((_event, _payload, acknowledge) => acknowledge(null, []));
    await onMessage(redisConfig.REDIS_CHANNELS.rowAuditResults, message);
    assert.equal(logError.mock.callCount(), 3);
});
