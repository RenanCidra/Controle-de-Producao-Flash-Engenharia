ALTER TABLE communication_group_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE communication_direct_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS communication_messages_group_unread_idx
  ON communication_messages(group_id, created_at, author_uid);

CREATE INDEX IF NOT EXISTS communication_direct_messages_unread_idx
  ON communication_direct_messages(conversation_id, created_at, author_uid);
