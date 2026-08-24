import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { RealtimeHub } from '../realtime.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

export function aiRouter(hub: RealtimeHub) {
  const router = Router();
  router.post('/analyze', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'An image is required' });
    const input = z.object({ cameraId: z.string().min(1), prompt: z.string().min(3).max(500) }).parse(req.body);
    const form = new FormData();
    const imageBytes = req.file.buffer.buffer.slice(req.file.buffer.byteOffset, req.file.buffer.byteOffset + req.file.buffer.byteLength) as ArrayBuffer;
    form.append('image', new Blob([imageBytes], { type: req.file.mimetype }), 'scene.jpg');
    form.append('prompt', input.prompt);
    const response = await fetch(`${config.AI_SERVICE_URL}/v1/analyze`, { method: 'POST', body: form });
    const analysis = await response.json() as { response?: string; model?: string; detail?: string };
    if (!response.ok || !analysis.response) return res.status(response.status).json({ error: analysis.detail ?? 'Analysis failed' });
    const { rows } = await pool.query(
      `INSERT INTO ai_analyses(camera_id,prompt,response,model) VALUES($1,$2,$3,$4)
       RETURNING id,camera_id AS "cameraId",prompt,response,model,created_at AS "createdAt"`,
      [input.cameraId, input.prompt, analysis.response, analysis.model],
    );
    hub.broadcast('ai.analysis', rows[0]);
    res.json({ data: rows[0] });
  });
  router.get('/analyses', async (_req, res) => {
    const { rows } = await pool.query(`SELECT id,camera_id AS "cameraId",prompt,response,model,created_at AS "createdAt" FROM ai_analyses ORDER BY created_at DESC LIMIT 50`);
    res.json({ data: rows });
  });
  return router;
}
