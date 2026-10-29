-- Add an internal login identifier while keeping old email addresses usable during migration.
-- Organizations are introduced here because older installations may not have this table yet.
CREATE TABLE IF NOT EXISTS organizations (
  id serial PRIMARY KEY,
  name text NOT NULL,
  trade_name text,
  tax_id text,
  plant_code text,
  email text,
  phone text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  address text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_name text;
UPDATE users SET login_name = 'conta-' || id::text WHERE login_name IS NULL OR btrim(login_name) = '';
ALTER TABLE users ALTER COLUMN login_name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_login_name_unique ON users (login_name);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Employee records are independent of system access accounts.
CREATE TABLE IF NOT EXISTS employees (
  id serial PRIMARY KEY,
  organization_id integer REFERENCES organizations(id) ON DELETE SET NULL,
  employee_code text,
  name text NOT NULL,
  department text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_code_unique ON employees (organization_id, employee_code);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_id_employees_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Legacy profiles are folded into the four supported access profiles.
UPDATE users SET role = CASE role
  WHEN 'MANAGER' THEN 'SUPERVISOR'
  WHEN 'VIEWER' THEN 'AUDITOR'
  WHEN 'QUALITY_INSPECTOR' THEN 'OPERATOR'
  ELSE role
END
WHERE role IN ('MANAGER', 'VIEWER', 'QUALITY_INSPECTOR');
