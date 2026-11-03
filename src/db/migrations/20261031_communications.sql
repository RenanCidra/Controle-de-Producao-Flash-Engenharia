CREATE TABLE IF NOT EXISTS communication_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  sector TEXT NOT NULL CHECK (char_length(sector) BETWEEN 2 AND 80),
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS communication_groups_sector_idx ON communication_groups(sector);
CREATE TABLE IF NOT EXISTS communication_group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES communication_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_uid TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS communication_group_members_user_idx ON communication_group_members(user_id, group_id);
INSERT INTO communication_group_members (group_id, user_id, added_by_uid)
SELECT group_row.id, user_row.id, group_row.created_by_uid
FROM communication_groups AS group_row
JOIN users AS user_row ON user_row.uid = group_row.created_by_uid
ON CONFLICT (group_id, user_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS communication_messages (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES communication_groups(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS communication_messages_group_idx ON communication_messages(group_id, created_at);

-- Individual conversations are unique per pair of system accounts.
CREATE TABLE IF NOT EXISTS communication_direct_conversations (
  id SERIAL PRIMARY KEY,
  direct_key TEXT NOT NULL UNIQUE,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS communication_direct_members (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES communication_direct_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS communication_direct_members_user_idx ON communication_direct_members(user_id, conversation_id);
CREATE TABLE IF NOT EXISTS communication_direct_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES communication_direct_conversations(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS communication_direct_messages_conversation_idx ON communication_direct_messages(conversation_id, created_at);
