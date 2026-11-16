import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { createPool, withDbRetry } from './index.ts';

const INCREMENTAL_SQL_FILES = [
  '20261031_communications.sql',
  '20261031_communications_read_state.sql',
  '20261101_communications_audio.sql',
  '20261101_communications_message_replies.sql',
  '20261103_communications_message_deletion.sql',
  '20261104_communications_reactions.sql',
  '20261105_communications_clear_history.sql',
  '20261113_chat_image_drawings.sql',
  '20261113_occurrences_intelligent.sql',
  '20261114_notifications_push.sql',
] as const;

const REQUIRED_COLUMNS: Array<[string, string]> = [
  ['users', 'avatar_url'],
  ['communication_direct_members', 'last_read_at'],
  ['communication_direct_members', 'history_cleared_at'],
  ['communication_group_members', 'last_read_at'],
  ['communication_group_members', 'history_cleared_at'],
  ['communication_direct_messages', 'reply_to_message_id'],
  ['communication_direct_messages', 'audio_storage_path'],
  ['communication_direct_messages', 'deleted_at'],
  ['communication_direct_messages', 'updated_at'],
  ['communication_direct_messages', 'attachment_type'],
  ['communication_direct_messages', 'image_storage_path'],
  ['communication_direct_messages', 'drawing_data'],
  ['communication_messages', 'reply_to_message_id'],
  ['communication_messages', 'audio_storage_path'],
  ['communication_messages', 'deleted_at'],
  ['communication_messages', 'updated_at'],
  ['communication_messages', 'attachment_type'],
  ['communication_messages', 'image_storage_path'],
  ['communication_messages', 'drawing_data'],
  ['communication_message_reactions', 'direct_message_id'],
  ['production_occurrences', 'code'],
  ['production_occurrences', 'source_message_id'],
  ['notifications', 'id'],
  ['push_subscriptions', 'endpoint'],
  ['notification_preferences', 'scope'],
];

async function hasAllRequiredColumns(): Promise<boolean> {
  const pool = createPool();
  const tables = [...new Set(REQUIRED_COLUMNS.map(([table]) => table))];
  const { rows } = await withDbRetry(() =>
    pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [tables],
    ),
  );
  const existing = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  return REQUIRED_COLUMNS.every(([table, column]) => existing.has(`${table}.${column}`));
}

async function runSqlWithCredentials(
  host: string,
  database: string,
  user: string,
  password: string,
  migrationsDir: string,
): Promise<void> {
  const pool = new Pool({
    host,
    database,
    user,
    password,
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;').catch((err) => {
        console.warn('Could not ensure users.avatar_url column:', (err as { code?: string; message?: string })?.code || err);
      });

      for (const fileName of INCREMENTAL_SQL_FILES) {
        const sqlText = await readFile(path.join(migrationsDir, fileName), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sqlText);
          await client.query('COMMIT');
        } catch (err: any) {
          await client.query('ROLLBACK').catch(() => undefined);
          console.warn(`Incremental migration ${fileName} did not complete:`, err?.code || err?.message || err);
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function ensureIncrementalMigrations(): Promise<void> {
  const host = process.env.SQL_HOST;
  const database = process.env.SQL_DB_NAME;
  if (!host || !database) return;

  if (await hasAllRequiredColumns()) {
    return;
  }

  console.warn('Incremental schema mismatch detected; applying idempotent SQL migrations...');
  const migrationsDir = path.dirname(fileURLToPath(new URL('./migrations/20261031_communications.sql', import.meta.url)));

  const credentialPairs: Array<{ user: string; password: string }> = [];
  if (process.env.SQL_ADMIN_USER && process.env.SQL_ADMIN_PASSWORD) {
    credentialPairs.push({ user: process.env.SQL_ADMIN_USER, password: process.env.SQL_ADMIN_PASSWORD });
  }
  if (
    process.env.SQL_USER
    && process.env.SQL_PASSWORD
    && process.env.SQL_USER !== process.env.SQL_ADMIN_USER
  ) {
    credentialPairs.push({ user: process.env.SQL_USER, password: process.env.SQL_PASSWORD });
  }

  if (!credentialPairs.length) {
    console.warn('Incremental schema mismatch detected, but no database credentials are available to apply migrations.');
    return;
  }

  for (const creds of credentialPairs) {
    try {
      await runSqlWithCredentials(host, database, creds.user, creds.password, migrationsDir);
      if (await hasAllRequiredColumns()) {
        console.log('Incremental SQL migrations verified/applied successfully.');
        return;
      }
    } catch (err: any) {
      console.warn('Migration attempt failed with configured DB user:', err?.code || err?.message || err);
    }
  }
}
