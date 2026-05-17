-- W3 complement: semântica adicional para taxonomy_feedback
-- (1) Garantir que reassigned_to só é preenchido quando feedback_type = 'reassigned'
ALTER TABLE taxonomy_feedback
    ADD CONSTRAINT chk_taxonomy_feedback_reassigned
        CHECK (
            (feedback_type = 'reassigned' AND reassigned_to IS NOT NULL)
            OR
            (feedback_type != 'reassigned' AND reassigned_to IS NULL)
        );

-- (2) Índice para queries por channel_id (FK fraca — NULL = feedback admin global)
CREATE INDEX IF NOT EXISTS idx_taxonomy_feedback_channel ON taxonomy_feedback(channel_id);

-- (3) Documentar semântica de channel_id via COMMENT ON COLUMN
-- channel_id é FK fraca intencional: NULL significa feedback de admin global (sem canal específico).
-- Sem referência formal (sem FK constraint) para evitar cascata ao deletar um canal.
COMMENT ON COLUMN taxonomy_feedback.channel_id IS
    'FK fraca intencional para canal do operador. NULL = feedback admin global (sem canal específico). Sem ON DELETE para evitar cascata ao deletar canal.';
