ALTER TABLE send_queue
    ALTER COLUMN catalog_id SET NOT NULL,
    DROP COLUMN IF EXISTS message_override,
    DROP COLUMN IF EXISTS image_url_override,
    DROP COLUMN IF EXISTS source;
