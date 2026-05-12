DROP INDEX IF EXISTS idx_groups_curator;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_curator_role_chk;
ALTER TABLE groups DROP COLUMN IF EXISTS curator_role;
ALTER TABLE groups DROP COLUMN IF EXISTS is_curator_group;
