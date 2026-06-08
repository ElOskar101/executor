import { Server as HttpServer } from "node:http";

import { Server as SocketServer } from "socket.io";

import { createRedisConnection, REDIS_CHANNELS } from "../configs/redis.config";
import { readExecutionLog } from "../adapters/mongo.adapter";

let io: SocketServer | null = null;
let subscriber: ReturnType<typeof createRedisConnection> | null = null;

function parseMessage(message: string) {
    try {
        return JSON.parse(message);
    } catch {
        return { message };
    }
}

export async function setupSocketServer(server: HttpServer) {
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

    subscriber.on("message", (channel, message) => {
        const payload = parseMessage(message);
        const executionId = payload.executionId;

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
