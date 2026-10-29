import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const host = process.env.SQL_HOST;
const database = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;
if (!host || !database || !user || !password) {
  throw new Error('SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER e SQL_ADMIN_PASSWORD são necessários para executar migrações.');
}

const pool = new Pool({ host, database, user, password, max: 1, connectionTimeoutMillis: 15000 });
const migrationPath = fileURLToPath(new URL('./20261029_access_accounts.sql', import.meta.url));

try {
  const sql = await readFile(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Access account migration applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error('Access account migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
