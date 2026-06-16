import { Server as HttpServer } from "node:http";

import { Server as SocketServer } from "socket.io";

import { createRedisConnection, REDIS_CHANNELS } from "../configs/redis.config";
import { readExecutionLog } from "../adapters/mongo.adapter";
import { createExecutionRealtimePersister } from "./execution-realtime-persister.service";
import { ExecutionLogEvent, ExecutionStatusEvent } from "../types/realtime.type";

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
    await subscriber.subscribe(REDIS_CHANNELS.logs, REDIS_CHANNELS.status, REDIS_CHANNELS.metrics);

    subscriber.on("message", async (channel, message) => {
        const payload = parseMessage(message);
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
