-- Irreversível por design: as tabelas do bandit (channel_bandit_state, learned_weights,
-- channel_weights) foram removidas no corte da camada de otimização automática
-- (W2 refactor 2026-06). Para restaurar, recriar a partir das migrations originais de
-- criação no histórico pré-2026-06 (ex.: 20260513100005_create_learned_weights.up.sql).
SELECT 1;
