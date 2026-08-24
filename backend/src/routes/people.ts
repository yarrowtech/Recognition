import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { anonymizeActivePerson } from '../presenceService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const createPerson = z.object({ name: z.string().trim().min(2).max(100), externalId: z.string().trim().max(100).optional() });
export const peopleRouter = Router();

peopleRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.external_id AS "externalId", p.status, p.created_at AS "createdAt",
      count(fp.id)::int AS "faceCount", max(s.last_seen_at) AS "lastSeen",
      count(DISTINCT s.id)::int AS visits
     FROM people p LEFT JOIN face_profiles fp ON fp.person_id=p.id
     LEFT JOIN sessions s ON s.person_id=p.id GROUP BY p.id ORDER BY p.name`,
  );
  res.json({ data: rows });
});

peopleRouter.post('/', async (req, res) => {
  const input = createPerson.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO people (name, external_id) VALUES ($1,$2)
     RETURNING id, name, external_id AS "externalId", status, created_at AS "createdAt"`,
    [input.name, input.externalId ?? null],
  );
  res.status(201).json({ data: rows[0] });
});

peopleRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id,p.name,p.external_id AS "externalId",p.status,p.created_at AS "createdAt",
      count(DISTINCT fp.id)::int AS "faceCount", count(DISTINCT s.id)::int AS visits,
      coalesce(sum(s.duration_seconds),0)::int AS "totalDurationSeconds"
     FROM people p LEFT JOIN face_profiles fp ON fp.person_id=p.id
     LEFT JOIN sessions s ON s.person_id=p.id WHERE p.id=$1 GROUP BY p.id`, [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Person not found' });
  const sessions = await pool.query(`SELECT id,camera_id AS "cameraId",started_at AS "startedAt",ended_at AS "endedAt",duration_seconds AS "durationSeconds",status FROM sessions WHERE person_id=$1 ORDER BY started_at DESC LIMIT 50`, [req.params.id]);
  res.json({ data: { ...rows[0], sessions: sessions.rows } });
});

peopleRouter.patch('/:id', async (req, res) => {
  const input = createPerson.partial().parse(req.body);
  const { rows } = await pool.query(
    `UPDATE people SET name=coalesce($2,name),external_id=coalesce($3,external_id),updated_at=now()
     WHERE id=$1 RETURNING id,name,external_id AS "externalId",status`,
    [req.params.id, input.name ?? null, input.externalId ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Person not found' });
  res.json({ data: rows[0] });
});

peopleRouter.delete('/:id', async (req, res) => {
  // Historical sessions are anonymized by ON DELETE SET NULL; biometric profiles are permanently deleted.
  const result = await pool.query(`DELETE FROM people WHERE id=$1`, [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Person not found' });
  anonymizeActivePerson(req.params.id);
  res.status(204).end();
});

peopleRouter.post('/:id/faces', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An image file is required' });
  const person = await pool.query(`SELECT id FROM people WHERE id=$1`, [req.params.id]);
  if (!person.rowCount) return res.status(404).json({ error: 'Person not found' });
  const body = new FormData();
  const imageBytes = req.file.buffer.buffer.slice(req.file.buffer.byteOffset, req.file.buffer.byteOffset + req.file.buffer.byteLength) as ArrayBuffer;
  body.append('image', new Blob([imageBytes], { type: req.file.mimetype }), req.file.originalname);
  const response = await fetch(`${config.AI_SERVICE_URL}/v1/enroll`, {
    method: 'POST', body, headers: { 'x-service-token': config.INTERNAL_SERVICE_TOKEN },
  });
  const result = await response.json() as { embedding?: number[]; modelName?: string; modelVersion?: string; detail?: string };
  if (!response.ok || !result.embedding) return res.status(response.status).json({ error: result.detail ?? 'Face enrollment failed' });
  const embedding = Buffer.from(new Float32Array(result.embedding).buffer);
  const { rows } = await pool.query(
    `INSERT INTO face_profiles (person_id,embedding,model_name,model_version) VALUES ($1,$2,$3,$4)
     RETURNING id,person_id AS "personId",model_name AS "modelName",created_at AS "createdAt"`,
    [req.params.id, embedding, result.modelName, result.modelVersion],
  );
  res.status(201).json({ data: rows[0] });
});

peopleRouter.delete('/:id/faces/:faceId', async (req, res) => {
  const result = await pool.query(`DELETE FROM face_profiles WHERE id=$1 AND person_id=$2`, [req.params.faceId, req.params.id]);
  res.status(result.rowCount ? 204 : 404).end();
});

peopleRouter.get('/:id/sessions', async (req, res) => {
  const { rows } = await pool.query(`SELECT id,camera_id AS "cameraId",started_at AS "startedAt",ended_at AS "endedAt",duration_seconds AS "durationSeconds",status FROM sessions WHERE person_id=$1 ORDER BY started_at DESC LIMIT 100`, [req.params.id]);
  res.json({ data: rows });
});
