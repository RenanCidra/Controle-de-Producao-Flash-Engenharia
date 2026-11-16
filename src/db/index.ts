import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    global._postgresPool.on('error', (err: any) => {
      // Idle client disconnects are expected when Cloud SQL proxy drops idle sockets
      console.warn('PostgreSQL pool idle client disconnected:', err?.message || err);
    });
  }
  return global._postgresPool;
};

const TRANSIENT_PG_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ECONNREFUSED',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08003',
  '08006',
]);

function isTransientDbError(error: any): boolean {
  const code = String(error?.code || error?.cause?.code || '');
  if (TRANSIENT_PG_CODES.has(code)) return true;
  const message = String(error?.message || error?.cause?.message || '');
  return /connection terminated|econnreset|epipe|closed|broken pipe|timeout exceeded when trying to connect|connection error/i.test(message);
}

export async function withDbRetry<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt < maxRetries && isTransientDbError(error)) {
        attempt += 1;
        console.warn(`Transient PostgreSQL connection error (attempt ${attempt}/${maxRetries}), retrying query...`, error?.code || error?.cause?.code || error?.message || error);
        await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
        continue;
      }
      throw error;
    }
  }
}

const pool = createPool();
export const db = drizzle(pool, { schema });
