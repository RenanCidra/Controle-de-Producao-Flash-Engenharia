-- Incremental migration for persistent private media objects in PostgreSQL
-- Used automatically for chat/occurrence images and audio when no external GCS bucket is provisioned.

CREATE TABLE IF NOT EXISTS private_media_objects (
  id SERIAL PRIMARY KEY,
  object_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_base64 TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS private_media_objects_path_uidx
  ON private_media_objects (object_path);
