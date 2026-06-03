import { Request, Response } from "express";
import mongoose from "mongoose";

import { createRedisConnection } from "../configs/redis.config";
import { getExecutionQueue } from "../queues/execution.queue";

export const getAppStats = async (_req: Request, res: Response) => {
  const mongoReadyState = mongoose.connection.readyState;
  const mongoStateLabel = ["disconnected", "connected", "connecting", "disconnecting"][mongoReadyState] || "unknown";

  let redisStatus: "up" | "down" = "down";
  try {
    const redis = createRedisConnection();
    const pong = await redis.ping();
    redisStatus = pong === "PONG" ? "up" : "down";
    redis.disconnect();
  } catch (_error) {
    redisStatus = "down";
  }

  let jobs = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
    prioritized: 0,
    waitingChildren: 0,
    queued: 0,
    running: 0,
  };

  try {
    const queue = getExecutionQueue();
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused", "prioritized", "waiting-children");

    jobs = {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
      prioritized: counts.prioritized ?? 0,
      waitingChildren: counts["waiting-children"] ?? 0,
      queued: (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0) + (counts["waiting-children"] ?? 0),
      running: counts.active ?? 0,
    };
  } catch (_error) {
    // Best-effort response for frontend status decoration.
  }

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    server: {
      status: "up",
    },
    mongo: {
      status: mongoReadyState === 1 ? "up" : "down",
      readyState: mongoReadyState,
      state: mongoStateLabel,
    },
    redis: {
      status: redisStatus,
    },
    jobs,
  });
};

