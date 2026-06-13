-- Irreversível por design: as tabelas órfãs do bandit (bandit_arms, bandit_arms_channel,
-- channel_score_weights, channel_score_weights_history) foram removidas no corte da camada
-- de otimização automática (W2 refactor 2026-06). Para restaurar, recriar a partir das
-- migrations originais de criação no histórico pré-2026-06.
SELECT 1;
