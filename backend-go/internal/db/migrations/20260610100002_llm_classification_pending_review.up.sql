-- Mitigação ADR-014: fila de revisão humana para classificações LLM.
-- Acumula items classificados pelo LLM aguardando aprovação humana enquanto
-- o loop de correção completo (W3+W5) não está disponível.
-- Métrica llm_classification_pending_review = COUNT(*) WHERE status = 'pending'
-- exposta via /api/admin/llm/test (Prometheus + OTel).

CREATE TABLE IF NOT EXISTS llm_classification_pending_review (
  id             BIGSERIAL PRIMARY KEY,
  catalog_id     BIGINT NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
  classification_type TEXT NOT NULL CHECK (classification_type IN ('brand', 'category')),
  raw_llm_output JSONB,
  confidence     NUMERIC(4,3),
  flagged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ,
  reviewer       TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_llm_pending_review_status ON llm_classification_pending_review(status);
CREATE INDEX IF NOT EXISTS idx_llm_pending_review_catalog ON llm_classification_pending_review(catalog_id);
