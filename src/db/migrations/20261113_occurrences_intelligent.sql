-- Incremental evolution of production_occurrences into Intelligent Occurrence Center.
-- Preserves all existing occurrences, events, and audit history.

ALTER TABLE production_occurrences
  ALTER COLUMN numero_op DROP NOT NULL;

-- Drop strict FK on numero_op so occurrences created from chat/prints can exist
-- even before the OP is synced into protheus_production_orders.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'production_occurrences'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'numero_op'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE production_occurrences DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE production_occurrences
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'OUTRO',
  ADD COLUMN IF NOT EXISTS pv_number text,
  ADD COLUMN IF NOT EXISTS parent_product text,
  ADD COLUMN IF NOT EXISTS component_code text,
  ADD COLUMN IF NOT EXISTS warehouse text,
  ADD COLUMN IF NOT EXISTS current_balance numeric(14, 4),
  ADD COLUMN IF NOT EXISTS requester_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sector text NOT NULL DEFAULT 'PCP',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'MEDIA',
  ADD COLUMN IF NOT EXISTS sla_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamp,
  ADD COLUMN IF NOT EXISTS opened_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_response_at timestamp,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp,
  ADD COLUMN IF NOT EXISTS closed_at timestamp,
  ADD COLUMN IF NOT EXISTS resolution_text text,
  ADD COLUMN IF NOT EXISTS is_recurrence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_occurrence_id integer REFERENCES production_occurrences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_message_kind text,
  ADD COLUMN IF NOT EXISTS source_message_id integer,
  ADD COLUMN IF NOT EXISTS notified_30m_at timestamp,
  ADD COLUMN IF NOT EXISTS notified_sla_breach_at timestamp;

-- Backfill sequential readable codes (OC-YYYY-NNN) and requester_id/opened_at for existing records.
UPDATE production_occurrences
SET code = 'OC-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || lpad(id::text, 3, '0')
WHERE code IS NULL;

UPDATE production_occurrences
SET opened_at = created_at
WHERE opened_at IS DISTINCT FROM created_at AND first_response_at IS NULL AND resolved_at IS NULL;

UPDATE production_occurrences po
SET requester_id = u.id
FROM users u
WHERE po.requester_id IS NULL
  AND po.created_by_uid = u.uid;

ALTER TABLE production_occurrences
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_occurrences_code_uidx
  ON production_occurrences (code);
CREATE INDEX IF NOT EXISTS production_occurrences_component_op_idx
  ON production_occurrences (component_code, numero_op, opened_at DESC);
CREATE INDEX IF NOT EXISTS production_occurrences_assignee_status_idx
  ON production_occurrences (assignee_id, status, sla_due_at);
CREATE INDEX IF NOT EXISTS production_occurrences_sector_status_idx
  ON production_occurrences (sector, status, opened_at DESC);

-- Expand status check constraint while preserving backward compatibility during rollout.
ALTER TABLE production_occurrences
  DROP CONSTRAINT IF EXISTS production_occurrences_status_check;

ALTER TABLE production_occurrences
  ADD CONSTRAINT production_occurrences_status_check
  CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED', 'ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO', 'CONCLUIDA', 'CANCELADA'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_occurrences_type_check'
  ) THEN
    ALTER TABLE production_occurrences
      ADD CONSTRAINT production_occurrences_type_check
      CHECK (type IN ('SEM_SALDO', 'EMPENHO', 'TRANSFERENCIA', 'BLOQUEIO_OP', 'QUALIDADE', 'OUTRO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_occurrences_sector_check'
  ) THEN
    ALTER TABLE production_occurrences
      ADD CONSTRAINT production_occurrences_sector_check
      CHECK (sector IN ('ALMOX', 'PCP', 'PRODUCAO', 'QUALIDADE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_occurrences_priority_check'
  ) THEN
    ALTER TABLE production_occurrences
      ADD CONSTRAINT production_occurrences_priority_check
      CHECK (priority IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA'));
  END IF;
END $$;

-- Dedicated threaded chat inside each occurrence.
CREATE TABLE IF NOT EXISTS occurrence_messages (
  id serial PRIMARY KEY,
  occurrence_id integer NOT NULL REFERENCES production_occurrences(id) ON DELETE CASCADE,
  author_id integer REFERENCES users(id) ON DELETE SET NULL,
  author_uid text NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS occurrence_messages_occurrence_idx
  ON occurrence_messages (occurrence_id, created_at ASC, id ASC);

-- Private storage references & vector drawing overlays (original image + annotation strokes).
CREATE TABLE IF NOT EXISTS occurrence_attachments (
  id serial PRIMARY KEY,
  occurrence_id integer NOT NULL REFERENCES production_occurrences(id) ON DELETE CASCADE,
  message_id integer REFERENCES occurrence_messages(id) ON DELETE SET NULL,
  author_id integer REFERENCES users(id) ON DELETE SET NULL,
  author_uid text NOT NULL,
  type text NOT NULL CHECK (type IN ('DRAWING', 'IMAGE', 'AUDIO', 'FILE')),
  storage_path text,
  mime_type text,
  size_bytes integer,
  duration_ms integer,
  original_image_path text,
  drawing_data jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS occurrence_attachments_occurrence_idx
  ON occurrence_attachments (occurrence_id, created_at ASC);
CREATE INDEX IF NOT EXISTS occurrence_attachments_message_idx
  ON occurrence_attachments (message_id);
