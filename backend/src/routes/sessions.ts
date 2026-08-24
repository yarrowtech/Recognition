import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';

const querySchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25), cameraId: z.string().optional(), personId: z.string().uuid().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() });
export const sessionsRouter = Router();

sessionsRouter.get('/', async (req, res) => {
  const q = querySchema.parse(req.query);
  const values: unknown[] = []; const clauses: string[] = [];
  const add = (condition: string, value: unknown) => { values.push(value); clauses.push(condition.replace('?', `$${values.length}`)); };
  if (q.cameraId) add('s.camera_id=?', q.cameraId);
  if (q.personId) add('s.person_id=?', q.personId);
  if (q.from) add('s.started_at>=?', q.from);
  if (q.to) add('s.started_at<=?', q.to);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  values.push(q.limit, (q.page - 1) * q.limit);
  const { rows } = await pool.query(
    `SELECT s.id,s.person_id AS "personId",coalesce(p.name,s.label) AS person,s.camera_id AS "cameraId",
      s.started_at AS "startedAt",s.ended_at AS "endedAt",s.duration_seconds AS "durationSeconds",s.status
     FROM sessions s LEFT JOIN people p ON p.id=s.person_id ${where} ORDER BY s.started_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
  );
  res.json({ data: rows, page: q.page });
});

sessionsRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM sessions WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Session not found' });
  res.json({ data: rows[0] });
});
