ALTER TABLE groups
    DROP COLUMN IF EXISTS daily_msg_cap,
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS category_id,
    DROP COLUMN IF EXISTS whatsapp_jid;
