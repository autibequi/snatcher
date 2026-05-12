# Snatcher — Arquitetura (pós-Fase 8)

> Documento arquitetural vivo. Atualizado em: 2026-05-20. Versão: 1.0.

---

## Visão geral

O **Promo Snatcher** é um sistema de curadoria e envio automatizado de ofertas via WhatsApp. Rastreia preços em marketplaces (Mercado Livre, Amazon, Shopee, etc.), classifica produtos usando um pipeline LLM, e dispara mensagens formatadas para grupos WhatsApp organizados por nicho. Loops LLM autônomos aprendem continuamente com dados de cliques e conversão.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Snatcher Stack                                │
│                                                                        │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────┐  │
│  │ Scrapers │ → │ Pipeline │ → │   Algo   │ → │ Senders (3+3)    │  │
│  │ (ML/AMZ/ │   │ (crawl→  │   │  Tick    │   │ modem1/2/3 →     │  │
│  │  Shopee) │   │  match)  │   │ (score)  │   │ grp A/B/C        │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────────┘  │
│       │                │               │                │             │
│  ┌────▼───────────────▼───────────────▼────────────────▼──────────┐  │
│  │              PostgreSQL 16 (tabelas + materialized views)       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│       │                                                  │             │
│  ┌────▼────────────┐                          ┌──────────▼──────────┐ │
│  │  Loops LLM      │                          │ Curator + Alertas   │ │
│  │  (L1-L9)        │                          │ (WA grupo admin)    │ │
│  └─────────────────┘                          └─────────────────────┘ │
│                                                                        │
│  cmd/server (8000)  ←→  Frontend SPA (6060)                          │
│  cmd/public (8001)  ←→  shortlinks /r/:id + webhooks públicos        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline

Fluxo central de dados:

```
SearchTerm → Crawler → CrawlResult → Pipeline.Process →
  Catalog (normalize + dedup) → AlgoTick (score) →
    ChannelRule.Match → SendQueue → Sender.Dispatch →
      Evolution API → WhatsApp Group → Redirect /r/:id →
        Click → Conversion (affiliate postback)
```

1. **Crawler**: busca por `search_term` nos marketplaces; retorna `CrawlResult` bruto.
2. **Pipeline.Process**: normaliza, deduplica, atribui `catalog_id`, calcula delta de preço.
3. **AlgoTick (L3)**: re-score diário por CTR, qualidade, recência. Atualiza `send_priority`.
4. **ChannelRule.Match**: cruza `catalog` com regras de canal (tag, brand, search_term, trigger).
5. **SendQueue**: target enfileirado com `status=pending_approval` → promovido para `queued`.
6. **Sender.Dispatch**: lê `send_queue`, seleciona modem por afinidade, envia via Evolution.
7. **Redirect**: `/r/:short_id` registra click em `clicks`, redireciona para URL do produto.
8. **Conversion**: postbacks de afiliados (Amazon, Shopee, Awin, ML) registrados em `conversions`.

---

## Schema — tabelas core

| Tabela | Responsabilidade |
|--------|-----------------|
| `search_terms` | Queries configuradas (keyword, fonte, intervalo) |
| `crawl_results` | Resultados brutos de crawl (título, preço, URL, fonte) |
| `catalog` | Produtos deduplicados + metadados LLM + `cached_image_path` (Fase 8) |
| `catalog_variants` | Variantes de preço por fonte/sub_id |
| `templates` | Templates de mensagem por categoria + `optimal_hours` (Fase 8) |
| `groups` | Grupos WhatsApp com afinidade por modem + `enabled` |
| `channels` | Canais lógicos (agregam regras e grupos) |
| `channel_rules` | Regras de match (tag/brand/search_term + trigger) |
| `send_queue` | Fila de envios pendentes (lifecycle: pending → queued → sent/failed) |
| `send_log` | Histórico imutável de todos os envios (auditoria) |
| `clicks` | Registros de clique nos shortlinks `/r/:id` |
| `conversions` | Conversões por afiliado (postback + polling) |
| `llm_autonomy` | Status dos 9 loops LLM (strikes, status, last_action_at) |
| `tunable_parameters` | Parâmetros configuráveis por escopo (global/category/group) |
| `alert_rules` | Regras de alertas baseadas em thresholds de métricas |
| `component_heartbeat` | Heartbeat dos componentes críticos (reaper, senders, etc.) |
| `ban_events` | Registros de banimentos de conta WhatsApp |
| `system_pauses` | Pausas sistêmicas emitidas pelos loops ou pelo Jonfrey |
| `mv_anomaly_signals` | View materializada: sinais de anomalia 24h por escopo |
| `mv_scraper_health` | View materializada: saúde dos scrapers |
| `mv_group_decay` | View materializada: decay de CTR por grupo (28d) |
| `mv_group_health` | View materializada: health consolidada + sentiment proxy (Fase 8) |

---

## 9 Loops LLM (+ Curator)

Cada loop opera com gate de autonomia (`llm_autonomy`): `active` → age sozinho, `suggesting` → propõe ao admin, `paused` → no-op.

| Loop | Função | Cron |
|------|--------|------|
| **L1** AffinityAdjust | Redistribui afinidade modem↔grupo por taxa de sucesso | Mensal dia 1 04:00 |
| **L2** TemplateAB | Rotaciona templates por CTR por categoria | Sábado 03:00 |
| **L3** AlgoTick | Re-score de produtos por CTR, qualidade, recência | A cada 5min |
| **L4** CapSuggest / CooldownSuggest | Propõe ajuste de cap/cooldown por grupo | Mensal dia 5 |
| **L5** TaxonomyGrow | Expande taxonomia com novos termos detectados | Domingo 03:00 |
| **L6** AnomalyPause | Detecta anomalias e emite system_pause | A cada 15min |
| **L7** ScraperFix | Detecta scrapers quebrados e propõe correção | Diário 04:00 |
| **L8** AutoTuning | Ajusta `tunable_parameters` por performance | Mensal dia 1 05:00 |
| **L9** ContentOptimize | Otimiza copy de templates por CTR | Terça 04:00 (gate 60d) |
| **Curator** | Coleta eventos críticos e envia alertas WA | A cada 5min |

---

## 3 Modems + 3 Senders (afinidade fixa)

O sistema opera com **afinidade modem↔grupo** configurável. Cada modem (conta WhatsApp) tem uma instância Evolution dedicada e é destinado a um conjunto de grupos por categoria ou região.

```
Modem A (instância evo-1) → grupos de eletrônicos / tech
Modem B (instância evo-2) → grupos de moda / beleza
Modem C (instância evo-3) → grupos de casa / jardim / esporte
```

O `AlgoTick (L3)` e o `L1 AffinityAdjust` podem rearranjar a afinidade com base em taxa de clique e banimentos. O `Reaper` libera send_queue travados a cada 5min.

Anti-ban: cooldown configurável por grupo (`channel_rules.cooldown_hours`), cap diário (`groups.daily_cap`), e CGNAT check a cada 5min para detectar IP público compartilhado.

---

## Auto-tuning via tunable_parameters + get_param()

Qualquer componente que precise de um parâmetro configurável usa:

```sql
SELECT get_param('nome_param', 'escopo', escopo_id)
```

Onde `escopo` pode ser `'global'`, `'category'` ou `'group'`. O loop L8 (`AutoTuning`) analisa métricas e propõe ajustes via `parameter_suggestions`. O admin aprova em `/api/admin/suggestions`.

Parâmetros notáveis:

| Parâmetro | Escopo | Efeito |
|-----------|--------|--------|
| `use_send_queue` | global | Liga/desliga senders v2 |
| `daily_cap_override` | group | Sobrescreve cap diário do grupo |
| `min_score_threshold` | category | Score mínimo para despacho |
| `template_weight_boost` | template | Peso extra no sorteo de template |

---

## Observabilidade

| Componente | Mecanismo |
|------------|-----------|
| `component_heartbeat` | Cada cron job registra último beat; Curator alerta se stale > 5min |
| `alert_rules` | Thresholds customizáveis (bans/h, failed_rate, CTR drop) |
| `mv_anomaly_signals` | Agrega bans_24h e failed_24h por modem/grupo/categoria |
| `mv_group_decay` | CTR drop 28d por grupo (base para L6 e Curator) |
| `mv_group_health` | Health consolidada + sentiment proxy por failure rate (Fase 8) |
| `llm_metrics` | Custo e latência por LLM call (dashboard `/api/admin/llm/usage`) |
| `/metrics` | Prometheus endpoint (latência HTTP, erros, jobs) |

---

## Custos esperados

Stack de produção estimada em **R$ 545-755/mês** conforme breakdown no RUNBOOK:

- Servidor (Mac mini ou VPS): R$ 0-200/mês
- Evolution API (self-hosted): R$ 0
- LLM (OpenRouter): R$ 50-150/mês (loops 9x, curator)
- Armazenamento imagens (Fase 8 — filesystem local): R$ 0 se volume local; R$ 5-20/mês se Backblaze B2/S3
- Postgres (self-hosted): R$ 0
- Cloudflare Tunnel: R$ 0 (plano free)

Ver RUNBOOK para detalhamento e alertas de custo.

---

## Diferenciais implementados na Fase 8 (opcional)

| Diferencial | Status | Arquivos |
|------------|--------|---------|
| Imagens nas mensagens | MVP funcional | `jobs/cache_images.go`, `senders/sender_media.go`, migration `20260520100001` |
| Detecção precoce de morte de grupo | MVP funcional | `curator/group_health_alert.go`, `mv_group_health`, migration `20260520100003` |
| A/B templates por horário | MVP funcional | `senders/sender_media.go:PickTemplateByHour`, migration `20260520100002` |
| Análise de sentimento | Stub | `jobs/sentiment_analyze.go` (no-op até Evolution chat-history disponível) |
| Bot conversacional | Stub | `handlers/public/promo_bot.go` (throttle in-memory; LLM response é Fase 8.5) |

**NOTA OPERACIONAL**: cache de imagens requer volume montado. Configurar `CACHE_IMAGES_DIR` ou garantir que `/var/lib/snatcher/images` seja volume persistente no docker-compose.
