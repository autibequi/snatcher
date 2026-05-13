-- Pesos de categoria por canal — substitui o campo único category_id dos channels_v2
CREATE TABLE IF NOT EXISTS channel_category_weights (
    channel_id  BIGINT NOT NULL REFERENCES channels_v2(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    weight      INT NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 100),
    PRIMARY KEY (channel_id, category_id)
);

-- Remove a coluna category_id do channels_v2 (substituída pelos pesos)
ALTER TABLE channels_v2 DROP COLUMN IF EXISTS category_id;
