-- 0085: create group_admins table
CREATE TABLE IF NOT EXISTS group_admins (
    id           BIGSERIAL PRIMARY KEY,
    group_id     BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL,
    account_id   BIGINT NOT NULL,
    added_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, account_type, account_id)
);
CREATE INDEX IF NOT EXISTS idx_group_admins_group ON group_admins(group_id);
