import Redis, { RedisOptions } from "ioredis";

export const REDIS_CHANNELS = {
    logs: "logs",
    status: "status",
    metrics: "metrics",
    control: "control",
} as const;

export const EXECUTION_QUEUE_NAME = process.env.EXECUTION_QUEUE_NAME || "playwright-executions";

export const redisConnectionOptions: RedisOptions = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: null,
};

export function createRedisConnection() {
    return new Redis(redisConnectionOptions);
}
