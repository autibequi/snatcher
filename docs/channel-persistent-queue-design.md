# Design (opcional): fila persistente por canal

Hoje o auto-match **não** mantém uma fila “top K por canal” entre ticks: a cada minuto reavalia um **slice** dos produtos mais recentes (ordenados por melhor score possível), competindo com cooldown, `max_per_run`, rate limit WA, backpressure e o **cap de produtos** da query.

## Objetivo

Para um ritmo mais previsível (“cada canal com fila dos melhores + ritmo estável”), introduzir uma **camada persistente** alimentada pelo mesmo score, mas que sobrevive entre execuções do worker.

## Proposta de modelo

### Tabela `channel_send_queue` (rascunho)

| Coluna | Tipo | Notas |
|--------|------|--------|
| `id` | bigserial PK | |
| `channel_id` | bigint FK → channel | |
| `product_id` | bigint FK → catalogproduct | |
| `score` | double precision | snapshot no momento do enqueue |
| `rank_in_channel` | int | ordem dentro do canal (1 = próximo) |
| `status` | text | `pending`, `dispatched`, `skipped`, `expired` |
| `reason` | text | opcional: rate_limit, backpressure, cooldown |
| `created_at` | timestamptz | |
| `scheduled_after` | timestamptz | próximo slot elegível (respeita ritmo) |
| `updated_at` | timestamptz | |

**Índices sugeridos**: `(channel_id, status, scheduled_after)`, `(product_id, channel_id)` único parcial onde `status = 'pending'` (evita duplicata).

### Fluxo

1. **Materialização** (job ou fim do auto-match): para cada canal com auto-match ativo, calcular top **K** produtos elegíveis (mesmas regras de hoje + política de curação). Inserir/atualizar fila; marcar entradas antigas como `expired` se o produto saiu do conjunto elegível.
2. **Consumo**: em vez de varrer os 100 produtos globais, o worker de criação de dispatches lê da fila por canal na ordem `scheduled_after`, respeitando `max_per_run`, cooldown, backpressure e rate limit WA **num único modelo mental**.
3. **Reconciliação**: ao despachar, marcar `dispatched`; se pulado por rate limit, manter `pending` e adiar `scheduled_after`.

### Migração

- Criar tabela vazia; feature flag `auto_match_use_persistent_queue` em `appconfig` (default false).
- Modo sombra: preencher fila e comparar com comportamento legado (métricas).

### Riscos

- Operações extras de escrita e consistência com logs `auto_match_logs`.
- Necessidade de job de limpeza para filas órfãs.

Este documento é **design only**; a implementação depende de priorização de produto.
