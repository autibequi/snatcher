-- Canais v2 — agrupadores lógicos de grupos com configuração de produto
CREATE TABLE IF NOT EXISTS channels_v2 (
    id                BIGSERIAL PRIMARY KEY,
    name              TEXT NOT NULL,
    category_id       BIGINT REFERENCES categories(id),
    quality_threshold NUMERIC(4,2) NOT NULL DEFAULT 0.40,
    daily_cap         INT NOT NULL DEFAULT 30,
    active            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atualiza FK de groups.channel_id para nova tabela (era FK morta para tabela dropada)
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_channel_id_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES channels_v2(id) ON DELETE SET NULL;
