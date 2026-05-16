CREATE TYPE rate_scope_t AS ENUM ('group','channel','modem');

CREATE TABLE rate_buckets (
    scope_type          rate_scope_t NOT NULL,
    scope_id            BIGINT NOT NULL,
    tokens_per_minute   INT NOT NULL DEFAULT 1,
    current_tokens      INT NOT NULL DEFAULT 0,
    refilled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_type, scope_id)
);
