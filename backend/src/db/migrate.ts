import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const path = fileURLToPath(new URL('../../migrations/001_initial.sql', import.meta.url));
await pool.query(await readFile(path, 'utf8'));
console.log('Database migration complete');
await pool.end();
