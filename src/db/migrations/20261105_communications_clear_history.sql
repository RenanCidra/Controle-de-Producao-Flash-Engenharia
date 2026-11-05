ALTER TABLE communication_group_members
  ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ;

ALTER TABLE communication_direct_members
  ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ;
