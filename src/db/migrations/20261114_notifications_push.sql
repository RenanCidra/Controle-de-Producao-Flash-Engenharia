-- Incremental migration for efficient in-app notifications, Web Push device subscriptions,
-- and per-user notification scope & quiet-hours preferences.
-- Preserves all existing tables and operational data.

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_id integer REFERENCES production_occurrences(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body_preview text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_occurrence_idx
  ON notifications (occurrence_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_label text,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uidx
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON push_subscriptions (user_id, is_active);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'SECTOR' CHECK (scope IN ('MINE', 'SECTOR', 'ALL')),
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start text NOT NULL DEFAULT '22:00',
  quiet_hours_end text NOT NULL DEFAULT '06:00',
  updated_at timestamp NOT NULL DEFAULT now()
);
