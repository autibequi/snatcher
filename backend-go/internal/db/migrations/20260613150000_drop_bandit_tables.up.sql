-- W2 refactor 2026-06: remove as tabelas da camada de otimização automática (bandit)
-- cortada na W1 — ver reavaliação 2026-06-13 ("otimização automática só depois do core").
-- CASCADE para arrastar views/constraints dependentes (mv_* e FKs do bandit).
--
-- NOTA: a coluna crawlresult.catalog_variant_id NÃO é dropada. Apesar do nome legado,
-- é o marcador de idempotência do pipeline ATIVO (pipeline/process.go: ListUnprocessedCrawlResults
-- usa `catalog_variant_id IS NULL`; MarkCrawlResultProcessed grava o id do item criado).
DROP TABLE IF EXISTS channel_bandit_state CASCADE;
DROP TABLE IF EXISTS learned_weights CASCADE;
DROP TABLE IF EXISTS channel_weights CASCADE;
