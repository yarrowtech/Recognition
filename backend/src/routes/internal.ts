import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { PresenceService } from '../presenceService.js';

const observationsSchema = z.object({
  cameraId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  tracks: z.array(z.object({
    trackId: z.number().int().nonnegative(), personId: z.string().uuid().nullable().optional(),
    label: z.string().max(100).optional(), confidence: z.number().min(0).max(1).optional(),
  })).max(100),
});

export function internalRouter(presence: PresenceService) {
  const router = Router();
  router.use((req, res, next) => {
    if (req.header('x-service-token') !== config.INTERNAL_SERVICE_TOKEN) return res.status(401).json({ error: 'Invalid service token' });
    next();
  });

  router.get('/face-profiles', async (_req, res) => {
    // Service-only endpoint. Embeddings never cross the browser-facing API boundary.
    const { rows } = await pool.query(
      `SELECT fp.id,fp.person_id AS "personId",p.name,encode(fp.embedding,'base64') AS embedding,
       fp.model_name AS "modelName",fp.model_version AS "modelVersion"
       FROM face_profiles fp JOIN people p ON p.id=fp.person_id WHERE p.status='active'`,
    );
    res.json({ data: rows });
  });

  router.post('/observations', async (req, res) => {
    const input = observationsSchema.parse(req.body);
    const people = await presence.observe(input.cameraId, input.tracks, new Date(input.timestamp));
    res.json({ data: people });
  });
  return router;
}
