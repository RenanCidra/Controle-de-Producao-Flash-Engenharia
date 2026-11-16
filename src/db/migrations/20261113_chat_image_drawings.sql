ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS image_storage_path text,
  ADD COLUMN IF NOT EXISTS image_mime_type text,
  ADD COLUMN IF NOT EXISTS image_size_bytes integer,
  ADD COLUMN IF NOT EXISTS drawing_data jsonb;

ALTER TABLE communication_direct_messages
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS image_storage_path text,
  ADD COLUMN IF NOT EXISTS image_mime_type text,
  ADD COLUMN IF NOT EXISTS image_size_bytes integer,
  ADD COLUMN IF NOT EXISTS drawing_data jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_messages_attachment_type_check') THEN
    ALTER TABLE communication_messages
      ADD CONSTRAINT communication_messages_attachment_type_check
      CHECK (attachment_type IS NULL OR attachment_type IN ('IMAGE', 'DRAWING'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_direct_messages_attachment_type_check') THEN
    ALTER TABLE communication_direct_messages
      ADD CONSTRAINT communication_direct_messages_attachment_type_check
      CHECK (attachment_type IS NULL OR attachment_type IN ('IMAGE', 'DRAWING'));
  END IF;
END $$;
