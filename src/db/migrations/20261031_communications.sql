CREATE TABLE IF NOT EXISTS communication_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  sector TEXT NOT NULL CHECK (char_length(sector) BETWEEN 2 AND 80),
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS communication_groups_sector_idx ON communication_groups(sector);
CREATE TABLE IF NOT EXISTS communication_messages (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES communication_groups(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS communication_messages_group_idx ON communication_messages(group_id, created_at);
