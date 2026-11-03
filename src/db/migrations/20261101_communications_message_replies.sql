ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER
  REFERENCES communication_messages(id) ON DELETE SET NULL;

ALTER TABLE communication_direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER
  REFERENCES communication_direct_messages(id) ON DELETE SET NULL;
