CREATE TABLE IF NOT EXISTS short_links (
    short_id   TEXT PRIMARY KEY,
    dest_url   TEXT NOT NULL UNIQUE,
    source     TEXT NOT NULL DEFAULT '',
    click_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
