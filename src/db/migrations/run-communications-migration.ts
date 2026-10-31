import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const { SQL_HOST: host, SQL_DB_NAME: database, SQL_ADMIN_USER: user, SQL_ADMIN_PASSWORD: password } = process.env;
if (!host || !database || !user || !password) throw new Error('SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER e SQL_ADMIN_PASSWORD são necessários.');
const pool = new Pool({ host, database, user, password, max: 1, connectionTimeoutMillis: 15000 });
try {
  const migrations = await Promise.all([
    readFile(fileURLToPath(new URL('./20261031_communications.sql', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('./20261031_communications_read_state.sql', import.meta.url)), 'utf8'),
  ]);
  const client = await pool.connect();
  try { await client.query('BEGIN'); for (const migration of migrations) await client.query(migration); await client.query('COMMIT'); console.log('Communications migrations applied.'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} finally { await pool.end(); }
