-- Incremental normalized mirrors for SH1 resources and Protheus commitments.
-- Existing mirrors and operational records are preserved.
CREATE TABLE IF NOT EXISTS protheus_resources (
  id serial PRIMARY KEY,
  branch text NOT NULL,
  resource_code text NOT NULL,
  resource_name text NOT NULL,
  production_line_raw text,
  labor_efficiency_raw text,
  cost_center text,
  last_maintenance_raw text,
  maintenance_interval_raw text,
  utilization_index_raw text,
  work_center_raw text,
  calendar_raw text,
  unlimited_resource_flag_raw text,
  cost_center_group_raw text,
  batch_id integer REFERENCES protheus_import_batches(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT protheus_resources_branch_code_unique UNIQUE (branch, resource_code)
);

CREATE TABLE IF NOT EXISTS protheus_commitments (
  id serial PRIMARY KEY,
  source_key text NOT NULL UNIQUE,
  branch text NOT NULL,
  product_code text NOT NULL,
  description text,
  production_order text NOT NULL,
  warehouse text,
  commitment_date_raw text,
  suspended_quantity numeric,
  source_situation text,
  committed_quantity numeric,
  commitment_balance numeric,
  value_class text,
  structure_sequence text,
  lot text,
  sub_lot text,
  expiration_date_raw text,
  origin_order text,
  alternate_unit_balance numeric,
  maintenance_order text,
  source_sequence text,
  lot_power text,
  process_quantity numeric,
  parent_product_code text,
  routing_code text,
  operation text,
  phantom text,
  observation text,
  created_by_name text,
  created_by_code text,
  batch_id integer REFERENCES protheus_import_batches(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protheus_commitments_op_idx ON protheus_commitments (production_order);
CREATE INDEX IF NOT EXISTS protheus_commitments_product_idx ON protheus_commitments (product_code);
