CREATE TABLE IF NOT EXISTS appconfig (
    id INT PRIMARY KEY DEFAULT 1,
    wa_provider TEXT NOT NULL DEFAULT 'evolution',
    wa_base_url TEXT,
    wa_api_key TEXT,
    wa_instance TEXT,
    global_interval INT NOT NULL DEFAULT 30,
    send_start_hour INT NOT NULL DEFAULT 8,
    send_end_hour INT NOT NULL DEFAULT 22,
    ml_client_id TEXT,
    ml_client_secret TEXT,
    wa_group_prefix TEXT DEFAULT 'Snatcher',
    amz_tracking_id TEXT,
    ml_affiliate_tool_id TEXT,
    alert_phone TEXT,
    use_short_links BOOLEAN NOT NULL DEFAULT true,
    tg_enabled BOOLEAN NOT NULL DEFAULT false,
    tg_bot_token TEXT,
    tg_bot_username TEXT,
    tg_group_prefix TEXT DEFAULT 'Snatcher',
    tg_last_update_id INT
);

INSERT INTO appconfig (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS waaccount (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'evolution',
    base_url TEXT,
    api_key TEXT,
    instance TEXT DEFAULT 'default',
    group_prefix TEXT DEFAULT 'Snatcher',
    status TEXT NOT NULL DEFAULT 'disconnected',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tgaccount (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bot_token TEXT,
    bot_username TEXT,
    group_prefix TEXT DEFAULT 'Snatcher',
    last_update_id INT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legacy v1 tables

CREATE TABLE IF NOT EXISTS "group" (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    search_prompt TEXT NOT NULL,
    min_val NUMERIC(12,4) NOT NULL,
    max_val NUMERIC(12,4) NOT NULL,
    whatsapp_group_id TEXT,
    wa_group_status TEXT,
    telegram_chat_id TEXT,
    tg_group_status TEXT,
    message_template TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    scan_interval INT NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product (
    id BIGSERIAL PRIMARY KEY,
    group_id INT NOT NULL REFERENCES "group"(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    price NUMERIC(12,4) NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    source TEXT NOT NULL,
    short_id TEXT,
    family_key TEXT,
    found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_short_id ON product(short_id);
CREATE INDEX IF NOT EXISTS idx_product_group_id ON product(group_id);

CREATE TABLE IF NOT EXISTS pricehistory (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    price NUMERIC(12,4) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scanjob (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES "group"(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    products_found INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    error_msg TEXT
);

CREATE TABLE IF NOT EXISTS clicklog (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_clicklog_product ON clicklog(product_id);

CREATE TABLE IF NOT EXISTS sentmessage (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    is_drop BOOLEAN NOT NULL DEFAULT false,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegramchat (
    chat_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    username TEXT,
    member_count INT,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    linked_group_id BIGINT REFERENCES "group"(id) ON DELETE SET NULL,
    linked_channel_id BIGINT
);

-- v2 pipeline tables

CREATE TABLE IF NOT EXISTS searchterm (
    id BIGSERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    queries JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_val NUMERIC(12,4) NOT NULL DEFAULT 0,
    max_val NUMERIC(12,4) NOT NULL DEFAULT 9999,
    sources TEXT NOT NULL DEFAULT 'all',
    active BOOLEAN NOT NULL DEFAULT true,
    crawl_interval INT NOT NULL DEFAULT 30,
    last_crawled_at TIMESTAMPTZ,
    result_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ml_affiliate_tool_id TEXT,
    amz_tracking_id TEXT
);

CREATE TABLE IF NOT EXISTS catalogproduct (
    id BIGSERIAL PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    brand TEXT,
    weight TEXT,
    image_url TEXT,
    lowest_price NUMERIC(12,4),
    lowest_price_url TEXT,
    lowest_price_source TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogproduct_name ON catalogproduct(canonical_name);

CREATE TABLE IF NOT EXISTS catalogvariant (
    id BIGSERIAL PRIMARY KEY,
    catalog_product_id BIGINT NOT NULL REFERENCES catalogproduct(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    variant_label TEXT,
    price NUMERIC(12,4) NOT NULL,
    url TEXT NOT NULL UNIQUE,
    image_url TEXT,
    source TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogvariant_product ON catalogvariant(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_catalogvariant_url ON catalogvariant(url);

CREATE TABLE IF NOT EXISTS crawlresult (
    id BIGSERIAL PRIMARY KEY,
    search_term_id BIGINT NOT NULL REFERENCES searchterm(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    price NUMERIC(12,4) NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    source TEXT NOT NULL,
    crawled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    catalog_variant_id BIGINT REFERENCES catalogvariant(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crawlresult_term ON crawlresult(search_term_id);

CREATE TABLE IF NOT EXISTS pricehistoryv2 (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES catalogvariant(id) ON DELETE CASCADE,
    price NUMERIC(12,4) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricehistoryv2_variant ON pricehistoryv2(variant_id);

CREATE TABLE IF NOT EXISTS groupingkeyword (
    id BIGSERIAL PRIMARY KEY,
    keyword TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS channel (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    slug TEXT UNIQUE,
    message_template TEXT,
    send_start_hour INT NOT NULL DEFAULT 8,
    send_end_hour INT NOT NULL DEFAULT 22,
    digest_mode BOOLEAN NOT NULL DEFAULT false,
    digest_max_items INT NOT NULL DEFAULT 5,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_slug ON channel(slug);

CREATE TABLE IF NOT EXISTS channeltarget (
    id BIGSERIAL PRIMARY KEY,
    channel_id BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    name TEXT,
    invite_url TEXT,
    status TEXT NOT NULL DEFAULT 'ok'
);

CREATE INDEX IF NOT EXISTS idx_channeltarget_channel ON channeltarget(channel_id);

CREATE TABLE IF NOT EXISTS channelrule (
    id BIGSERIAL PRIMARY KEY,
    channel_id BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL,
    match_value TEXT,
    max_price NUMERIC(12,4),
    notify_new BOOLEAN NOT NULL DEFAULT true,
    notify_drop BOOLEAN NOT NULL DEFAULT false,
    notify_lowest BOOLEAN NOT NULL DEFAULT false,
    drop_threshold NUMERIC(12,4) NOT NULL DEFAULT 0.10,
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_channelrule_channel ON channelrule(channel_id);

CREATE TABLE IF NOT EXISTS sentmessagev2 (
    id BIGSERIAL PRIMARY KEY,
    catalog_product_id BIGINT NOT NULL REFERENCES catalogproduct(id) ON DELETE RESTRICT,
    channel_target_id BIGINT NOT NULL REFERENCES channeltarget(id) ON DELETE CASCADE,
    is_drop BOOLEAN NOT NULL DEFAULT false,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentmessagev2_product ON sentmessagev2(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_sentmessagev2_target ON sentmessagev2(channel_target_id);

CREATE TABLE IF NOT EXISTS crawllog (
    id BIGSERIAL PRIMARY KEY,
    search_term_id BIGINT NOT NULL REFERENCES searchterm(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    ml_count INT NOT NULL DEFAULT 0,
    amz_count INT NOT NULL DEFAULT 0,
    error_msg TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawllog_term ON crawllog(search_term_id);

CREATE TABLE IF NOT EXISTS broadcastmessage (
    id BIGSERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    image_url TEXT,
    channel_ids TEXT NOT NULL DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'pending',
    sent_count INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ,
    error_msg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
