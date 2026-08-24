import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';

const cameraSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/).max(30), name: z.string().min(2).max(100), location: z.string().max(150).optional(), status: z.enum(['enabled','disabled']).default('enabled') });
export const camerasRouter = Router();

camerasRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(`SELECT id,name,location,source,type,status,configuration,created_at AS "createdAt" FROM cameras ORDER BY name`);
  res.json({ data: rows });
});
camerasRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT id,name,location,source,type,status,configuration,created_at AS "createdAt" FROM cameras WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
  res.json({ data: rows[0] });
});
camerasRouter.post('/', async (req, res) => {
  const item = cameraSchema.parse(req.body);
  const { rows } = await pool.query(`INSERT INTO cameras(id,name,location,status) VALUES($1,$2,$3,$4) RETURNING *`, [item.id,item.name,item.location ?? null,item.status]);
  res.status(201).json({ data: rows[0] });
});
camerasRouter.patch('/:id', async (req, res) => {
  const item = cameraSchema.omit({ id: true }).partial().parse(req.body);
  const { rows } = await pool.query(`UPDATE cameras SET name=coalesce($2,name),location=coalesce($3,location),status=coalesce($4,status),updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id,item.name ?? null,item.location ?? null,item.status ?? null]);
  if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
  res.json({ data: rows[0] });
});
camerasRouter.delete('/:id', async (req, res) => {
  try { const result = await pool.query(`DELETE FROM cameras WHERE id=$1`, [req.params.id]); res.status(result.rowCount ? 204 : 404).end(); }
  catch { res.status(409).json({ error: 'Camera has historical sessions and cannot be deleted' }); }
});
