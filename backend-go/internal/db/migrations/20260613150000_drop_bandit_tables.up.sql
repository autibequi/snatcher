-- W2 refactor 2026-06: remove as tabelas órfãs da camada de otimização automática (bandit)
-- cortada na W1 — ver reavaliação 2026-06-13. Nomes confirmados contra o schema real e o
-- código (0 refs em runtime — seguro dropar).
--   bandit_arms / bandit_arms_channel        → Thompson/UCB arms
--   channel_score_weights / *_history        → pesos de score auto-tunados
--
-- NÃO dropadas aqui — ainda têm uso em runtime (remoção exige limpar o código antes, follow-up):
--   channel_category_weights  → algo_dryrun.go, sql_channels.go
--   learned_weights_channel   → jobs/clusters_compute.go (job compute_clusters ainda ativo)
-- learned_weights (singular) já não existe no banco (consolidada por migration anterior); o
-- refresh_learned_weights.go que a referencia é dead code (job removido do scheduler na W1).
--
-- CASCADE arrasta views/constraints dependentes.
DROP TABLE IF EXISTS bandit_arms_channel CASCADE;
DROP TABLE IF EXISTS bandit_arms CASCADE;
DROP TABLE IF EXISTS channel_score_weights_history CASCADE;
DROP TABLE IF EXISTS channel_score_weights CASCADE;
