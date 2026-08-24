import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectRedis, redis } from './cache.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { PresenceService } from './presenceService.js';
import { RealtimeHub } from './realtime.js';

const server = createServer();
const hub = new RealtimeHub(server);
const presence = new PresenceService(hub);
const app = createApp(hub, presence);
server.on('request', app);

await pool.query('SELECT 1');
await connectRedis();
await presence.restore();
server.listen(config.PORT, () => logger.info({ port: config.PORT }, 'Sentinel API listening'));

async function shutdown() {
  presence.stop();
  server.close();
  if (redis.isOpen) await redis.quit();
  await pool.end();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
