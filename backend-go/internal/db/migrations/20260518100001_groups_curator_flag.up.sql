ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_curator_group BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS curator_role TEXT;

CREATE INDEX IF NOT EXISTS idx_groups_curator ON groups (curator_role) WHERE is_curator_group = true;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_curator_role_chk') THEN
        ALTER TABLE groups ADD CONSTRAINT groups_curator_role_chk
            CHECK (curator_role IS NULL OR curator_role IN ('critical', 'tracking'));
    END IF;
END $$;
