import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default('postgresql://sentinel:sentinel@localhost:5432/sentinel'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  INTERNAL_SERVICE_TOKEN: z.string().min(16).default('local-development-token'),
  TRACK_LOST_GRACE_SECONDS: z.coerce.number().positive().default(7),
  RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export const config = schema.parse(process.env);
