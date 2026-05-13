DROP TABLE IF EXISTS channel_category_weights;
ALTER TABLE channels_v2 ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id);
