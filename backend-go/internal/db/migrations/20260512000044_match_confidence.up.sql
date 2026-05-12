-- match_confidence: score 0..1 do fuzzy/LLM match no momento do merge.
-- match_method: 'exact_url' | 'fuzzy_high' | 'llm_tiebreaker' | 'new_product'
ALTER TABLE catalogvariant ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(4,3);
ALTER TABLE catalogvariant ADD COLUMN IF NOT EXISTS match_method TEXT;

CREATE INDEX IF NOT EXISTS idx_catalogvariant_match_confidence
  ON catalogvariant(match_confidence)
  WHERE match_confidence IS NOT NULL;
