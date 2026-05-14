-- Suporte a disparos manuais (texto livre) na send_queue.
-- catalog_id vira nullable — disparo manual não tem produto vinculado.
-- message_override: mensagem pré-montada pelo Composer (texto + link já inclusos).
-- image_url_override: imagem selecionada manualmente.
ALTER TABLE send_queue
    ALTER COLUMN catalog_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS message_override   TEXT,
    ADD COLUMN IF NOT EXISTS image_url_override TEXT,
    ADD COLUMN IF NOT EXISTS source            TEXT NOT NULL DEFAULT 'auto';
-- source: 'auto' = Score Engine, 'manual' = disparo manual pelo Composer
