-- Complemento da migration 20260607100001_quarantine_events:
-- Adiciona coluna triggered_by ausente na versão inicial.
-- Também corrige os índices: separa idx_quarantine_events_subject (lookup por subject)
-- do idx_quarantine_events_active (filtra apenas registros ainda ativos),
-- e remove o índice anterior que incluía quarantine_until desnecessariamente.

ALTER TABLE quarantine_events
    ADD COLUMN IF NOT EXISTS triggered_by TEXT;

-- Remove índice anterior que era composto e incluía quarantine_until
DROP INDEX IF EXISTS idx_quarantine_events_active;

-- Índice separado para lookup por subject (sem filtro — cobre listagem e foreign-key lookups)
CREATE INDEX IF NOT EXISTS idx_quarantine_events_subject
    ON quarantine_events(subject_kind, subject_id);

-- Índice filtrado apenas para registros ativos (lifted_at IS NULL = em quarentena agora)
CREATE INDEX IF NOT EXISTS idx_quarantine_events_active
    ON quarantine_events(lifted_at)
    WHERE lifted_at IS NULL;

-- Índice para queries de "eventos recentes" (audit log chronológico)
CREATE INDEX IF NOT EXISTS idx_quarantine_events_triggered
    ON quarantine_events(triggered_at DESC);

-- Aviso: redirect_domains.quarantine_until é campo legado (timestamp opaco).
-- Será removido quando W3 estiver completa e todos os consumers migrarem para quarantine_events.
-- NÃO remover agora — ainda usado por baseline.go e handlers de redirect_domains.
COMMENT ON COLUMN redirect_domains.quarantine_until IS
    'LEGADO W3: será removido após migração completa para quarantine_events. '
    'Não remover enquanto baseline.go e handlers de redirect_domains ainda referenciarem este campo.';
