import { Router } from 'express';
import { pool } from '../db/pool.js';

export const analyticsRouter = Router();
analyticsRouter.get('/overview', async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
  const { rows: [summary] } = await pool.query(
    `SELECT count(*)::int AS "totalVisits", count(DISTINCT person_id)::int AS "uniquePeople",
      coalesce(sum(duration_seconds),0)::bigint AS "totalPresenceSeconds",
      coalesce(avg(duration_seconds),0)::int AS "averageVisitSeconds",
      count(*) FILTER (WHERE person_id IS NULL)::int AS "unknownVisits"
     FROM sessions WHERE started_at >= now() - ($1 * interval '1 day')`, [days],
  );
  const { rows: hourly } = await pool.query(
    `SELECT extract(hour from started_at)::int AS hour,count(*)::int AS entries
     FROM sessions WHERE started_at >= now() - ($1 * interval '1 day') GROUP BY 1 ORDER BY 1`, [days],
  );
  const { rows: daily } = await pool.query(
    `SELECT to_char(date_trunc('day',started_at),'Mon DD') AS day,count(*)::int AS visits,
      coalesce(sum(duration_seconds),0)::bigint AS seconds
     FROM sessions WHERE started_at >= now() - ($1 * interval '1 day') GROUP BY date_trunc('day',started_at) ORDER BY date_trunc('day',started_at)`, [days],
  );
  res.json({ data: { ...summary, hourly, daily } });
});

analyticsRouter.get('/hourly', async (req, res) => {
  const { rows } = await pool.query(`SELECT extract(hour from started_at)::int AS hour,count(*)::int AS entries FROM sessions WHERE started_at>=current_date GROUP BY 1 ORDER BY 1`);
  res.json({ data: rows });
});
analyticsRouter.get('/daily', async (_req, res) => {
  const { rows } = await pool.query(`SELECT date_trunc('day',started_at)::date AS day,count(*)::int AS visits FROM sessions WHERE started_at>=current_date-interval '30 day' GROUP BY 1 ORDER BY 1`);
  res.json({ data: rows });
});
