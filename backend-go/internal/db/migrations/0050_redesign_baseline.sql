-- migrate:up
-- 0050: ReDesign Snatcher — schema novo de domínio
-- Estende tabelas existentes e cria entidades novas.
-- Idempotente: usa IF NOT EXISTS e IF NOT EXISTS nos índices.

-- ─────────────────────────────────────────────────
-- USERS (auth JWT)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         BIGSERIAL PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name       TEXT,
    role       TEXT NOT NULL DEFAULT 'operator'
                   CHECK (role IN ('operator', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_active ON refresh_tokens(user_id, expires_at)
    WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────
-- CHANNELS (extend com audience JSONB)
-- ─────────────────────────────────────────────────
-- tabela `channel` já existe (migration 0001)
ALTER TABLE channel ADD COLUMN IF NOT EXISTS audience JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE channel ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE channel ADD COLUMN IF NOT EXISTS member_count INT NOT NULL DEFAULT 0;
ALTER TABLE channel ADD COLUMN IF NOT EXISTS ctr_30d NUMERIC(6,4) NOT NULL DEFAULT 0;
ALTER TABLE channel ADD COLUMN IF NOT EXISTS cvr_30d NUMERIC(6,4) NOT NULL DEFAULT 0;
ALTER TABLE channel ADD COLUMN IF NOT EXISTS revenue_30d NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_channel_audience_gin ON channel USING gin (audience);

-- ─────────────────────────────────────────────────
-- ACCOUNTS (extend com role + throttle)
-- ─────────────────────────────────────────────────
ALTER TABLE waaccount ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'sender'
    CHECK (role IN ('sender', 'reader'));
ALTER TABLE waaccount ADD COLUMN IF NOT EXISTS daily_limit INT NOT NULL DEFAULT 200;
ALTER TABLE waaccount ADD COLUMN IF NOT EXISTS sent_today INT NOT NULL DEFAULT 0;

ALTER TABLE tgaccount ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'sender'
    CHECK (role IN ('sender', 'reader'));
ALTER TABLE tgaccount ADD COLUMN IF NOT EXISTS daily_limit INT NOT NULL DEFAULT 500;
ALTER TABLE tgaccount ADD COLUMN IF NOT EXISTS sent_today INT NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────
-- GROUPS (nova entidade — destino físico)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
    id            BIGSERIAL PRIMARY KEY,
    short_id      TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    channel_id    BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    wa_account_id BIGINT REFERENCES waaccount(id) ON DELETE SET NULL,
    tg_account_id BIGINT REFERENCES tgaccount(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    platform      TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
    jid           TEXT,
    invite_link   TEXT,
    status        TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'paused', 'banned', 'full')),
    member_count  INT NOT NULL DEFAULT 0,
    overrides     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_groups_channel ON groups(channel_id);
CREATE INDEX IF NOT EXISTS ix_groups_status ON groups(status);
CREATE INDEX IF NOT EXISTS ix_groups_platform ON groups(platform);

-- ─────────────────────────────────────────────────
-- AFFILIATE PROGRAMS (extends tabela affiliates existente)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_programs (
    id          BIGSERIAL PRIMARY KEY,
    short_id    TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    name        TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    active      BOOLEAN NOT NULL DEFAULT true,
    rules       JSONB NOT NULL DEFAULT '{}'::jsonb,
    postback    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_affiliate_programs_marketplace ON affiliate_programs(marketplace, active);

CREATE TABLE IF NOT EXISTS affiliate_postbacks (
    id                  BIGSERIAL PRIMARY KEY,
    program_id          BIGINT NOT NULL REFERENCES affiliate_programs(id) ON DELETE CASCADE,
    payload             JSONB NOT NULL,
    signature           TEXT,
    dispatch_target_id  BIGINT,  -- FK adicionada depois (circular dep com dispatch_targets)
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────
-- DISPATCHES (nova — disparo multi-target)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatches (
    id           BIGSERIAL PRIMARY KEY,
    short_id     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    product_id   BIGINT REFERENCES catalogvariant(id) ON DELETE SET NULL,
    composed_by  TEXT NOT NULL DEFAULT 'manual'
                      CHECK (composed_by IN ('manual', 'auto')),
    message      JSONB NOT NULL DEFAULT '{}'::jsonb,
    affiliate_link TEXT,
    scheduled_for TIMESTAMPTZ,
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status       TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'queued', 'sending', 'completed', 'failed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dispatches_status ON dispatches(status);
CREATE INDEX IF NOT EXISTS ix_dispatches_scheduled ON dispatches(scheduled_for)
    WHERE scheduled_for IS NOT NULL;

CREATE TABLE IF NOT EXISTS dispatch_targets (
    id           BIGSERIAL PRIMARY KEY,
    dispatch_id  BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
    group_id     BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    wa_account_id BIGINT REFERENCES waaccount(id) ON DELETE SET NULL,
    tg_account_id BIGINT REFERENCES tgaccount(id) ON DELETE SET NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sending', 'delivered', 'failed')),
    attempted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error_reason TEXT,
    click_count  INT NOT NULL DEFAULT 0,
    conversions  INT NOT NULL DEFAULT 0,
    revenue      NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_dispatch_targets_dispatch ON dispatch_targets(dispatch_id);
CREATE INDEX IF NOT EXISTS ix_dispatch_targets_status ON dispatch_targets(status);
CREATE INDEX IF NOT EXISTS ix_dispatch_targets_group ON dispatch_targets(group_id);

-- Adicionar FK circular agora que dispatch_targets existe
ALTER TABLE affiliate_postbacks
    ADD COLUMN IF NOT EXISTS dispatch_target_id_fk BIGINT
    REFERENCES dispatch_targets(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────
-- PUBLIC LINKS (fallback chain)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_links (
    id                 BIGSERIAL PRIMARY KEY,
    slug               TEXT UNIQUE NOT NULL,
    channel_id         BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    fallback_chain     JSONB NOT NULL DEFAULT '[]'::jsonb,
    redirect_strategy  TEXT NOT NULL DEFAULT 'first_active'
                            CHECK (redirect_strategy IN ('first_active', 'least_full', 'round_robin')),
    round_robin_idx    INT NOT NULL DEFAULT 0,
    active             BOOLEAN NOT NULL DEFAULT true,
    clicks_30d         INT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_public_links_slug ON public_links(slug);

CREATE TABLE IF NOT EXISTS public_link_clicks (
    id         BIGSERIAL PRIMARY KEY,
    link_id    BIGINT NOT NULL REFERENCES public_links(id) ON DELETE CASCADE,
    ip_hash    TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_public_link_clicks_link ON public_link_clicks(link_id, clicked_at);

-- ─────────────────────────────────────────────────
-- CLUSTERS (análise de audiência)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clusters (
    id              BIGSERIAL PRIMARY KEY,
    label           TEXT NOT NULL,
    description     TEXT,
    member_channels BIGINT[] NOT NULL DEFAULT '{}',
    metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
    top_categories  TEXT[] NOT NULL DEFAULT '{}',
    top_brands      TEXT[] NOT NULL DEFAULT '{}',
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────
-- GROUP SPIES (crawler de grupos concorrentes)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_spies (
    id               BIGSERIAL PRIMARY KEY,
    short_id         TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    group_name       TEXT NOT NULL,
    platform         TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
    invite_link      TEXT NOT NULL,
    reader_wa_id     BIGINT REFERENCES waaccount(id) ON DELETE SET NULL,
    reader_tg_id     BIGINT REFERENCES tgaccount(id) ON DELETE SET NULL,
    remote_group_id  TEXT,
    active           BOOLEAN NOT NULL DEFAULT true,
    joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    stats            JSONB NOT NULL DEFAULT '{}'::jsonb,
    deleted_at       TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────
-- COMPOSE CACHE (LLM preview cache)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compose_cache (
    cache_key   TEXT PRIMARY KEY,
    response    JSONB NOT NULL,
    operation   TEXT NOT NULL DEFAULT 'compose',
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_compose_cache_expires ON compose_cache(expires_at);

-- migrate:down
-- Não implementado — fazer manualmente se necessário
