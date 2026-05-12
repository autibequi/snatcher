-- F09 DOWN: recria schemas vazios das tabelas v1 dropadas
--
-- ATENCAO: esta migration NAO restaura dados — eles foram dropados de forma destrutiva.
-- Para restaurar dados: pg_dump executado em F00 (pre-requisito I3 do TASK.md).
--
-- Objetivo do DOWN: permitir que o sistema de migrations (golang-migrate) reconheca
-- o estado pre-F09 e possibilite rollback de schema em ambientes de dev/staging.
-- Em producao: restaurar pg_dump antes de rodar este DOWN.

-- ── Catalog v1 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogproduct (
    id               BIGSERIAL PRIMARY KEY,
    canonical_name   TEXT NOT NULL,
    brand            TEXT,
    weight           TEXT,
    image_url        TEXT,
    lowest_price     NUMERIC(12,4),
    lowest_price_url TEXT,
    lowest_price_source TEXT,
    tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
    attributes       JSONB DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogvariant (
    id                  BIGSERIAL PRIMARY KEY,
    catalog_product_id  BIGINT NOT NULL REFERENCES catalogproduct(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    variant_label       TEXT,
    price               NUMERIC(12,4) NOT NULL,
    url                 TEXT NOT NULL,
    image_url           TEXT,
    source              TEXT NOT NULL,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogproduct_taxonomy (
    product_id   BIGINT NOT NULL REFERENCES catalogproduct(id) ON DELETE CASCADE,
    taxonomy_id  BIGINT NOT NULL,
    role         TEXT NOT NULL,
    confidence   REAL NOT NULL DEFAULT 1.0,
    source       TEXT DEFAULT 'pipeline',
    created_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (product_id, taxonomy_id, role)
);

CREATE TABLE IF NOT EXISTS pricehistory (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL,
    price       NUMERIC(12,4) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Channel hierarchy v1 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel (
    id                BIGSERIAL PRIMARY KEY,
    name              TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    slug              TEXT UNIQUE,
    message_template  TEXT,
    send_start_hour   INT NOT NULL DEFAULT 8,
    send_end_hour     INT NOT NULL DEFAULT 22,
    digest_mode       BOOLEAN NOT NULL DEFAULT false,
    digest_max_items  INT NOT NULL DEFAULT 5,
    active            BOOLEAN NOT NULL DEFAULT true,
    audience          JSONB NOT NULL DEFAULT '{}'::jsonb,
    member_count      INT NOT NULL DEFAULT 0,
    ctr_30d           NUMERIC(6,4) NOT NULL DEFAULT 0,
    cvr_30d           NUMERIC(6,4) NOT NULL DEFAULT 0,
    revenue_30d       NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channelrule (
    id               BIGSERIAL PRIMARY KEY,
    channel_id       BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    match_type       TEXT NOT NULL,
    match_value      TEXT,
    max_price        NUMERIC(12,4),
    notify_new       BOOLEAN NOT NULL DEFAULT true,
    notify_drop      BOOLEAN NOT NULL DEFAULT false,
    notify_lowest    BOOLEAN NOT NULL DEFAULT false,
    drop_threshold   NUMERIC(12,4) NOT NULL DEFAULT 0.10,
    active           BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS channeltarget (
    id          BIGSERIAL PRIMARY KEY,
    channel_id  BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,
    chat_id     TEXT NOT NULL,
    name        TEXT,
    invite_url  TEXT,
    status      TEXT NOT NULL DEFAULT 'ok'
);

CREATE TABLE IF NOT EXISTS channel_target_accounts (
    id          BIGSERIAL PRIMARY KEY,
    target_id   BIGINT NOT NULL REFERENCES channeltarget(id) ON DELETE CASCADE,
    account_id  BIGINT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('primary','fallback')),
    priority    INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(target_id, account_id)
);

CREATE TABLE IF NOT EXISTS channel_automations (
    id                   BIGSERIAL PRIMARY KEY,
    channel_id           BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    enabled              BOOLEAN NOT NULL DEFAULT FALSE,
    auto_match_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    threshold            FLOAT,
    max_per_run          INT,
    cooldown_hours       INT NOT NULL DEFAULT 6,
    events_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    notify_new           BOOLEAN NOT NULL DEFAULT FALSE,
    notify_drop          BOOLEAN NOT NULL DEFAULT FALSE,
    notify_lowest        BOOLEAN NOT NULL DEFAULT FALSE,
    drop_threshold       FLOAT NOT NULL DEFAULT 0.10,
    match_type           TEXT NOT NULL DEFAULT 'all',
    match_value          TEXT,
    max_price            FLOAT,
    paused_until         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(channel_id)
);

-- ── Analítico v1 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_match_logs (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT,
    channel_id  BIGINT,
    dispatch_id BIGINT,
    score       FLOAT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
