import { Server as HttpServer } from "node:http";

import { Server as SocketServer } from "socket.io";

import { createRedisConnection, REDIS_CHANNELS } from "../configs/redis.config";
import { readExecutionLog } from "../adapters/mongo.adapter";
import { createExecutionRealtimePersister } from "./execution-realtime-persister.service";
import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";
import { PdfAuditPayload, RowAuditAcknowledgement } from "../types/row-audit.type";
import { createRowAudit } from "./row-audit.service";

let io: SocketServer | null = null;
let subscriber: ReturnType<typeof createRedisConnection> | null = null;

function parseMessage(message: string) {
    try {
        return JSON.parse(message);
    } catch {
        return { message };
    }
}

function isExecutionLogEvent(payload: any): payload is ExecutionLogEvent {
    return payload
        && typeof payload.executionId === "string"
        && typeof payload.message === "string"
        && (payload.stream === "stdout" || payload.stream === "stderr" || payload.stream === "system")
        && typeof payload.timestamp === "string";
}

function isExecutionStatusEvent(payload: any): payload is ExecutionStatusEvent {
    return payload
        && typeof payload.executionId === "string"
        && typeof payload.status === "string"
        && typeof payload.timestamp === "string";
}

export async function setupSocketServer(server: HttpServer) {
    const realtimePersister = createExecutionRealtimePersister();

    io = new SocketServer(server, {
        cors: {
            origin: process.env.SOCKET_CORS_ORIGIN || "*",
        },
    });

    io.on("connection", (socket) => {
        socket.on("execution:row:audit", async (
            payload: PdfAuditPayload,
            acknowledge?: (response: RowAuditAcknowledgement) => void,
        ) => {
            let response: RowAuditAcknowledgement;
            try {
                if (!payload?.row || !payload.template || !payload.options) {
                    throw new Error("Row, template and options are required");
                }
                if (typeof payload.row._id !== "string" || !payload.row._id.trim()) {
                    throw new Error("row._id is required for socket row audits");
                }

                const rowAudit = await createRowAudit(payload);
                response = { ok: true, rowId: payload.row._id, rowAuditId: rowAudit._id.toString() };
            } catch (error) {
                console.error("[SOCKET] Failed to queue row audit", error);
                response = { ok: false, error: error instanceof Error ? error.message : "Failed to queue row audit" };
            }

            if (typeof acknowledge === "function") acknowledge(response);
        });

        socket.on("execution:join", async ({ executionId }: { executionId?: string }) => {
            if (!executionId) return;

            socket.join(`execution:${executionId}`);
            socket.emit("execution:logs:history", {
                executionId,
                content: await readExecutionLog(executionId),
            });
        });

        socket.on("execution:leave", ({ executionId }: { executionId?: string }) => {
            if (!executionId) return;
            socket.leave(`execution:${executionId}`);
        });
    });

    subscriber = createRedisConnection();
    await subscriber.subscribe(
        REDIS_CHANNELS.logs,
        REDIS_CHANNELS.status,
        REDIS_CHANNELS.metrics,
        REDIS_CHANNELS.rowAuditResults,
        REDIS_CHANNELS.rowAuditErrors,
    );

    subscriber.on("message", async (channel, message) => {
        const payload = parseMessage(message);
        if (channel === REDIS_CHANNELS.rowAuditResults || channel === REDIS_CHANNELS.rowAuditErrors) {
            if (!payload?.rowAuditId && !payload?.jobId && !payload?.rowId) {
                console.warn("[SOCKET] Row audit event has no audit, job, or row ID", { channel });
                return;
            }
            const status = channel === REDIS_CHANNELS.rowAuditResults ? "done" : "failed";
            let rowId = payload.rowId;
            let rowAuditId = payload.rowAuditId || payload.jobId;
            try {
                if (rowAuditId) {
                    let audit;
                    try {
                        audit = await realtimePersister.persistRowAuditStatus(rowAuditId, status);
                    } catch (error) {
                        if (!payload.jobId || payload.jobId === rowAuditId) throw error;
                        console.warn("[SOCKET] Row audit ID lookup failed; trying job ID", { rowAuditId, jobId: payload.jobId });
                    }
                    if (!audit && payload.jobId && payload.jobId !== rowAuditId) {
                        audit = await realtimePersister.persistRowAuditStatus(payload.jobId, status);
                        if (audit) rowAuditId = payload.jobId;
                    }
                    rowId = audit?.row.rowId || rowId;
                    if (!audit) console.warn("[SOCKET] Row audit record not found", { channel, rowAuditId, jobId: payload.jobId });
                }
            } catch (error) {
                console.error("[SOCKET] Failed to update row audit status", error);
            }
            if (!io?.sockets.sockets.size) {
                console.warn("[SOCKET] No connected clients for row audit result", { rowAuditId, rowId });
                return;
            }

            io.timeout(5000).emit("execution:row:audit-result", { ...payload, ...(rowAuditId ? { rowAuditId } : {}), rowId, status }, (
                error: Error | null,
                responses: Array<{ ok?: boolean } | undefined>,
            ) => {
                if (error || !responses.length || responses.some((response) => response?.ok !== true)) {
                    console.error("[SOCKET] Row audit result was not acknowledged by all clients", { rowAuditId, rowId, error, responses });
                    return;
                }
                console.info(`[SOCKET] Row audit result acknowledged by ${responses.length} client(s)`, { rowAuditId, rowId });
            });
            return;
        }

        const executionId = payload.executionId;

        try {
            if (channel === REDIS_CHANNELS.logs && isExecutionLogEvent(payload)) {
                await realtimePersister.persistLogEvent(payload);
            }

            if (channel === REDIS_CHANNELS.status && isExecutionStatusEvent(payload)) {
                await realtimePersister.persistStatusEvent(payload);
            }
        } catch (error) {
            console.error(`[SOCKET] Failed to persist ${channel} event`, error);
        }

        if (executionId) {
            io?.to(`execution:${executionId}`).emit(channel, payload);
            return;
        }

        io?.emit(channel, payload);
    });

    return io;
}

export async function closeSocketServer() {
    subscriber?.disconnect();
    subscriber = null;

    if (io) {
        await io.close();
        io = null;
    }
}
