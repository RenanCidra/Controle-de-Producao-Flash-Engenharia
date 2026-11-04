ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE communication_direct_messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS communication_message_reactions (
  id SERIAL PRIMARY KEY,
  group_message_id INTEGER REFERENCES communication_messages(id) ON DELETE CASCADE,
  direct_message_id INTEGER REFERENCES communication_direct_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT communication_message_reactions_target_check CHECK (
    (group_message_id IS NOT NULL AND direct_message_id IS NULL)
    OR (group_message_id IS NULL AND direct_message_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_message_reactions_group_unique
  ON communication_message_reactions(group_message_id, user_id, emoji)
  WHERE group_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS communication_message_reactions_direct_unique
  ON communication_message_reactions(direct_message_id, user_id, emoji)
  WHERE direct_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS communication_message_reactions_group_idx
  ON communication_message_reactions(group_message_id);

CREATE INDEX IF NOT EXISTS communication_message_reactions_direct_idx
  ON communication_message_reactions(direct_message_id);
