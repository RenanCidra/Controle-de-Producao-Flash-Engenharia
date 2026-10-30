import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const { SQL_HOST: host, SQL_DB_NAME: database, SQL_ADMIN_USER: user, SQL_ADMIN_PASSWORD: password } = process.env;
if (!host || !database || !user || !password) {
  throw new Error('SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER e SQL_ADMIN_PASSWORD são necessários para executar esta migração.');
}

const pool = new Pool({ host, database, user, password, max: 1, connectionTimeoutMillis: 15000 });
const migrationPath = fileURLToPath(new URL('./20261030_protheus_resources_commitments.sql', import.meta.url));
try {
  const migration = await readFile(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(migration);
    await client.query('COMMIT');
    console.log('Protheus resources and commitments migration applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error('Protheus mirror migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
