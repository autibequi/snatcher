-- migrate:up
CREATE TABLE IF NOT EXISTS channel_target_accounts (
    id BIGSERIAL PRIMARY KEY,
    target_id BIGINT NOT NULL REFERENCES channeltarget(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES waaccount(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('primary','fallback')),
    priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(target_id, account_id)
);
CREATE INDEX IF NOT EXISTS ix_cta_target ON channel_target_accounts(target_id, priority);

-- Backfill: each ChannelTarget gets 1 row (primary) pointing to the first active WAAccount with matching provider
INSERT INTO channel_target_accounts (target_id, account_id, role, priority)
SELECT ct.id, wa.id, 'primary', 0
FROM channeltarget ct
CROSS JOIN (
  SELECT DISTINCT provider FROM waaccount WHERE active = true
) p
JOIN waaccount wa ON wa.provider = p.provider AND wa.active = true
WHERE ct.provider = p.provider
  AND wa.id = (
    SELECT MIN(id) FROM waaccount WHERE provider = ct.provider AND active = true
  )
ON CONFLICT DO NOTHING;

-- migrate:down
-- noop
