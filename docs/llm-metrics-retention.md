# Retenção de `llm_metrics`

A tabela `llm_metrics` (criada em `0061_llm_metrics.sql`) registra cada chamada LLM (operação, modelo, tokens, custo, cache hit, latência). Sem retenção, cresce indefinidamente.

## Recipe SQL — limpeza manual / ad-hoc

Apaga registros com mais de 90 dias:

```sql
DELETE FROM llm_metrics
WHERE created_at < now() - interval '90 days';
```

Os índices `idx_llm_metrics_created` e `idx_llm_metrics_operation_created` já tornam o DELETE eficiente.

## Quem deve rodar

- **Curto prazo:** rodar manualmente via `make shell` + `psql` quando a tabela passar de ~1M linhas.
- **Médio prazo:** agendar como job diário (ex: cron container ou job Go no `internal/scheduler/`). Stub disponível: `Store.PurgeOldLLMMetrics(days int)` em `internal/store/sql_store.go`.

## Observabilidade

Pode-se monitorar tamanho via:

```sql
SELECT pg_size_pretty(pg_total_relation_size('llm_metrics')) AS size,
       count(*) AS rows,
       min(created_at) AS oldest,
       max(created_at) AS newest
FROM llm_metrics;
```
