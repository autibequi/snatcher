-- W3 card6: adiciona coluna human_correction em catalog_llm_queue
-- e seed do parametro min_taxonomy_confidence.

-- human_correction=false = enqueue automatico (confidence baixo)
-- human_correction=true  = correcao manual pelo operador via taxonomy_feedback
ALTER TABLE catalog_llm_queue
    ADD COLUMN IF NOT EXISTS human_correction BOOLEAN NOT NULL DEFAULT false;

-- Seed do threshold de confianca minima para classificacao taxonomica.
-- Abaixo desse valor o item e automaticamente enfileirado em catalog_llm_queue.
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value)
VALUES ('global', NULL, 'min_taxonomy_confidence', 0.70, 0.70, 0.10, 1.00)
ON CONFLICT (scope_type, scope_id, param_name) DO NOTHING;
