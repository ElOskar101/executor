import { createRedisConnection, REDIS_CHANNELS } from "../configs/redis.config";

type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

let publisher: ReturnType<typeof createRedisConnection> | null = null;

/**
 * Redis adapter for realtime events.
 */

function getPublisher() {
  if (!publisher) {
    publisher = createRedisConnection();
  }

  return publisher;
}

export async function publishRealtimeEvent(channel: RedisChannel, payload: unknown) {
  await getPublisher().publish(channel, JSON.stringify(payload));
}

export async function closeRealtimeAdapter() {
  publisher?.disconnect();
  publisher = null;
}

