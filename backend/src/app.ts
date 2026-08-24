import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import type { PresenceService } from './presenceService.js';
import type { RealtimeHub } from './realtime.js';
import { aiRouter } from './routes/ai.js';
import { analyticsRouter } from './routes/analytics.js';
import { camerasRouter } from './routes/cameras.js';
import { internalRouter } from './routes/internal.js';
import { peopleRouter } from './routes/people.js';
import { sessionsRouter } from './routes/sessions.js';

export function createApp(hub: RealtimeHub, presence: PresenceService) {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((item) => item.trim()) }));
  app.use(express.json({ limit: '1mb' }));
  // Public browser APIs are rate limited. Internal AI callbacks are authenticated
  // separately and run at the configured frame-processing rate.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8' }));

  app.get('/api/health', async (_req, res) => {
    let database = false;
    try { await pool.query('SELECT 1'); database = true; } catch { /* reported in response */ }
    let ai = false;
    try { ai = (await fetch(`${config.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { /* reported in response */ }
    res.status(database ? 200 : 503).json({ status: database ? 'ok' : 'degraded', services: { database, ai } });
  });
  app.get('/api/live', (req, res) => res.json({ data: presence.list(req.query.cameraId as string | undefined) }));
  app.post('/api/live/disconnect', async (req, res) => {
    const cameraId = typeof req.body.cameraId === 'string' ? req.body.cameraId : 'CAM01';
    await presence.observe(cameraId, [], new Date());
    res.status(202).json({ data: { cameraId, status: 'disconnected' } });
  });
  app.use('/api/people', peopleRouter);
  app.use('/api/cameras', camerasRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/ai', aiRouter(hub));
  app.use('/internal', internalRouter(presence));
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Request failed');
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errors);
  return app;
}
