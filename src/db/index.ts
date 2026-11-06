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

export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const message = String(error?.message || error?.cause?.message || '');
    const isTransient = /connection terminated|econnreset|epipe|closed|broken pipe/i.test(message);
    if (isTransient) {
      console.warn('Transient PostgreSQL connection error, retrying query with fresh connection...');
      return await operation();
    }
    throw error;
  }
}

const pool = createPool();
export const db = drizzle(pool, { schema });
