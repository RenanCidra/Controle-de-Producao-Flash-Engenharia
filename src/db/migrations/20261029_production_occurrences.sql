-- Occurrences are application-owned operational records, linked to existing Protheus OPs.
-- RESTRICT preserves occurrence history if an OP is removed from the local mirror.
CREATE TABLE IF NOT EXISTS production_occurrences (
  id serial PRIMARY KEY,
  numero_op text NOT NULL REFERENCES protheus_production_orders(numero_op) ON DELETE RESTRICT,
  occurrence_type text NOT NULL,
  description text NOT NULL,
  operation text,
  workstation text,
  immediate_action text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  created_by_uid text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_occurrences_op_idx
  ON production_occurrences (numero_op, created_at DESC);
CREATE INDEX IF NOT EXISTS production_occurrences_status_idx
  ON production_occurrences (status, created_at DESC);

CREATE TABLE IF NOT EXISTS production_occurrence_events (
  id serial PRIMARY KEY,
  occurrence_id integer NOT NULL REFERENCES production_occurrences(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('CREATED', 'NOTE', 'STATUS_CHANGED')),
  message text NOT NULL,
  previous_status text,
  new_status text,
  author_uid text NOT NULL,
  author_name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_occurrence_events_occurrence_idx
  ON production_occurrence_events (occurrence_id, created_at ASC);

