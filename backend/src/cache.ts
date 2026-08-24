import { createClient } from 'redis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = createClient({ url: config.REDIS_URL });
redis.on('error', (error) => logger.warn({ error: error.message }, 'Redis unavailable; realtime cache is degraded'));

export async function connectRedis() {
  try {
    await redis.connect();
  } catch {
    // PostgreSQL remains authoritative; the API can run with a degraded cache.
  }
}

export async function cacheOccupancy(cameraId: string, value: unknown) {
  if (!redis.isReady) return;
  await redis.set(`camera:${cameraId}:occupancy`, JSON.stringify(value), { EX: 30 });
}
