# GAP_ANALYSIS.md

> Gap analysis do snatcher existente vs specs cimentadas (`LE GRAN PLAN/*`).
> Data: 2026-05-11. Branch: clean (último commit da árvore atual).
> Autor: Claude (executor) sob direção do Pedrinho.
> Status: **rascunho aguardando aprovação — não avançar pra Fase 1 sem OK**.

---

## Resumo executivo

O snatcher existente é um sistema **bem mais maduro do que "70%"** em volume de código (76 migrations, 48 handlers admin, 9 scrapers, scheduler com 7+ workers, frontend React+Vite), mas foi construído sobre uma **ontologia conceitual diferente** da que está cimentada nas specs. Os componentes funcionais cobrem boa parte do *fluxo* (crawl → catálogo → matching → envio), porém o **modelo físico (3 modems 4G com afinidade fixa)**, o **algoritmo de seleção em 5 camadas com `quality_score` pré-computado**, os **9 loops LLM autônomos com `llm_actions`/`llm_autonomy`/dead-man switch**, o **conversion tracking real (não só CTR)** e a **infra de auto-tuning (`tunable_parameters` + `get_param()`)** **não existem**. A maior parte da migração é *aditiva* (criar tabelas + workers paralelos), com poucos pontos de divergência que exigirão renomeação/strangler. Apenas duas decisões de produto exigem confirmação prévia (Telegram on/off, destino do AutoMatch/Jonfrey).

---

## Componentes existentes

| Componente | Stack | Responsabilidade atual | Status | Gap vs specs |
|---|---|---|---|---|
| `cmd/server` (porta 8000) | Go + chi + sqlx + Postgres 16 | Admin API, painel CRUD, login JWT | Funcionando | OK — base reaproveitável |
| `cmd/public` (porta 8001) | Go | Shortlinks `/r/:short_id` + endpoints públicos | Funcionando | OK — base do redirector cimentado |
| `cmd/migrate` | dbmate-like (`-- migrate:up/down`) | Aplica migrations versionadas | Funcionando | OK — usar formato existente |
| `cmd/seed` | Go | Seeds dev | Funcionando | OK — estender pros seeds cimentados |
| `cmd/llm-eval` | Go | Eval offline de prompts | Funcionando | OK — manter |
| `internal/scrapers` | Go puro (HTTP + alguns chromium) | 9 scrapers: ML, Amazon, Shopee, Shein, AliExpress, Magalu, Humble, Kinguin, Awin | Parcial | Anti-bot é **só headers + cookie env** — falta stack 7 camadas (stealth, fingerprint rotation, jitter, captcha policy, IP routing por modem) |
| `internal/scraperbridge` | Go | Bridge entre scrapers e pipeline | Funcionando | OK |
| `internal/pipeline` | Go | crawl → process (triagem) → evaluate | Funcionando | Falta: `quality_score` pré-computado, `content_hash`, `dedup_key`, hard rejects formalizados em tabela `triage_rules` |
| `internal/match` | Go | Score multiplicativo Category/Brand/Drop/Price/History | Funcionando | Conceitualmente próximo da camada 3 do cimentado, **mas sem `learned_weights` (EPC), sem `group_category_affinity` editável, sem diversidade/anti-saturação, sem exploration adaptativo** |
| `internal/curation` (`apply.go`/`script.go`) + Jonfrey | Go + LLM | Aplicação de curadoria via script + revisão LLM com cache | Funcionando | É **review semi-automático com human-in-the-loop**, não loop autônomo. Não tem `llm_actions`/`llm_autonomy` |
| `internal/scheduler` | gocron v2 | Workers: pipeline (crawl), tg poller, dispatch (15s), auto_match (15s), promote_pending (1min), curation_heuristic (30s), ads (1min), clusters (cron semanal), Jonfrey (1min com interval interno) | Funcionando | **Sem janela 21h-6h America/Sao_Paulo no Algo**, sem pacing diluído por grupo, sem advisory lock no tick principal. Há `dispatch_send_window` separado mas é por grupo |
| `internal/scheduler/auto_match_worker.go` | Go | Lê produtos recentes, calcula score por canal, dispara pros grupos | Funcionando | É o "Algo tick" atual, mas roda a cada 15s e **não respeita estrutura 1-item-por-grupo-por-tick com pacing**; faz batch. Sem `send_queue` separada — escreve direto em `dispatches`/`dispatch_targets` |
| `internal/scheduler/dispatch_worker.go` | Go + Evolution API | Drena `dispatch_targets` pendentes, sanitiza msg, envia via WA/TG | Funcionando | **Worker único, sem partition por modem**, sem cooldown 90s ±30s por conta, sem rotação determinística, sem detecção de ban explícita (só `consecutive_failures`) |
| `internal/messaging` | Go (Evolution + Telegram bot) | Gateway abstrato pra WA + TG | Funcionando | Especificação cimentada **só fala WhatsApp**. Manter TG como side-channel ou descontinuar? (questão em aberto) |
| `internal/redirect` | Go + cache in-memory | `/r/:short_id` resolve canonical URL + injeta affiliate em runtime, cache 1h | Funcionando | **OK — alinhado com specs.** Falta: pool de 4 domínios com afinidade modem; fraud filter no logger (rate-limit IP / UA blacklist); detecção de viral_boost |
| `internal/affiliates` | Go | Injeção de tags por programa | Funcionando | OK — manter |
| `internal/llm` | Go + OpenRouter/OpenAI-compat | Client, budget, cache, cost, json-extract, telemetry, router | Funcionando | Robusto. **Falta wiring pros 9 loops cimentados, prompts registry específicos por loop, cache de prompt prefixo (DeepSeek 98%)**. Provider DeepSeek V4 Flash não está cravado no `llm_config` |
| `internal/prompts` | Go embed | Registry de prompts em arquivos | Funcionando | Base boa pra adicionar prompts dos loops L1/L2/L5/L6/L7/L8/L9/Curator |
| `internal/observability` | slog + prometheus | Logger JSON + métricas Prometheus | Funcionando | Falta: `component_heartbeat`, `alert_rules` SQL-editáveis, `mv_anomaly_signals`, `mv_scraper_health`, `mv_group_decay` |
| `internal/notifier` | Go | Notificações operacionais simples | Funcionando | Não é o curator cimentado. Curator LLM (2 grupos WA) inexiste |
| `internal/jobs` | Go + Postgres `background_jobs` | Jobs assíncronos persistentes com reaper de órfãos | Funcionando | **OK — base reaproveitável pra `jobs` cimentado** (precisa renomear `background_jobs` → `jobs` ou manter os dois) |
| `internal/auth` | JWT + refresh tokens | Login admin | Funcionando | OK |
| `internal/spy` + `group_spies` | Go | Crawler de grupos concorrentes | Funcionando | **Existe mas não está nas specs.** Manter (vale ouro pra learning) ou descontinuar? |
| `internal/clusters` | Go + LLM | Análise semanal de audiência | Funcionando | **Não está nas specs.** Mantenho? |
| `internal/invitelinks` | Go | Gestão de invite links de grupos | Funcionando | Não está nas specs; provavelmente manter |
| `internal/ws` | Go | WebSocket pra dashboard ao vivo | Funcionando | Não está nas specs; manter (dashboard) |
| `frontend/` | React 18 + Vite + Tailwind | SPA admin (porta 6060) + futuro split admin/public | Funcionando | Manter — base sólida pra dashboard dos loops + dashboard de sugestões L4 + grupo de alertas |
| `docker-compose.yml` | Evolution v2.3.1 + evo-postgres 15 + evo-redis 7 + app-postgres 16 + backend + redirect + frontend + watchtower + cloudflared | Stack completa | Funcionando | **Sem conceito de 3 modems / 3 senders**, sem Coolify orquestrando (mas há `coolify/`). Deploy atual mira Raspberry Pi, não Mac mini |
| Infra deploy | Coolify + GitHub Actions + ghcr.io | Pull de imagem `ghcr.io/autibequi/snatcher-backend:latest` + Watchtower 15min | Funcionando | OK — pipeline de deploy reaproveitável |

---

## Schema diff

Resumo: 56 tabelas existentes vs 26 cimentadas. **Sobreposição nominal**: 5 (`sources`, `groups`, `group_admins`, `clusters`, `compose_cache`). **Schemas idênticos**: 0. **Schemas próximos**: 2 (`sources`, `group_admins`).

### Tabelas das specs já existentes (com gap de schema)

| Tabela cimentada | Tabela existente | Schema match | Gap concreto |
|---|---|---|---|
| `sources` | `sources` | Próximo | Verificar campo `trust_score NUMERIC(3,2)`, `config JSONB` com `affiliate_param/affiliate_tag`. Provavelmente OK |
| `categories` | (não existe como tabela) | — | Categorias hoje vivem em `taxonomy` (estrutura diferente) + `channel.audience JSONB`. **Criar `categories` e migrar/seedar** as 5 cimentadas |
| `catalog` | `catalogproduct` + `catalogvariant` | Divergente | Modelo atual é produto pai + variants. Cimentado é tabela única `catalog` com `dedup_key`, `short_id` (nanoid 8-10), `canonical_url` (sem affiliate), `content_hash`, `quality_score`, `price_anchor_30d`, `anchor_confidence`, `last_price_change_at`, `canonical_url_alive`, `send_ready`. Estratégia: **criar `catalog` nova; popular via job que dá fold em `catalogvariant`**; manter `catalogvariant` enquanto migra |
| `price_history` | `pricehistory` | Próximo | `pricehistory.product_id` → `price_history.catalog_id`. PK composta (`catalog_id, seen_at`). Renomeação/projeção |
| `groups` | `groups` | Divergente | Schema atual tem `channel_id`, `wa_account_id`, `tg_account_id`, `platform`, `jid`, `invite_link`, `status`. Cimentado: `whatsapp_jid`, `category_id`, `timezone`, `daily_msg_cap`, sem `channel_id`. Estratégia: **adicionar colunas faltantes; manter colunas legacy enquanto Channel ainda existe** |
| `group_admins` | `group_admins` | Próximo | Cimentado tem `priority INT`. Verificar presença |
| `clicks` | `clicklog` + `shortlink_clicks` | Divergente | Cimentado: `short_id`, `catalog_id`, `domain_host`, `group_id`, `user_agent`, `ip`. Atual: dois logs separados sem `catalog_id`/`group_id`. **Criar `clicks` unificada, popular via shim no redirector, manter os legados durante transição** |
| `conversions` | `affiliate_conversions` | Divergente forte | Cimentado: `short_id`, `catalog_id`, `group_id`, `source_id`, `external_tx_id`, `commission`, `currency`, `occurred_at`, `raw_webhook`, `UNIQUE (external_tx_id, source_id)`. Atual: `program_id`, `click_id`, `external_order_id`, `revenue`, `status` — minimalista. **Criar `conversions` nova; migrar histórico via best-effort se houver** |
| `jobs` | `background_jobs` | Divergente | Atual tem schema de gerenciamento de tarefas em background; cimentado é fila genérica (`crawl_page`, `triage_item`, `upsert_catalog`, ...). Decidir: estender `background_jobs` OU criar `jobs` separada |
| `templates` | (campo `message_template` em "group" legacy + templates implícitos no compose) | Ausente | **Criar tabela `templates(id, category_id, body, weight, enabled)`** + seed com variações por categoria |

### Tabelas cimentadas inexistentes (criar)

| Tabela | Função | Prioridade |
|---|---|---|
| `pages` | endpoints crawlados com cron | P1 (substitui `searchterm` em parte ou complementa) |
| `raw_items` | payload bruto pré-triagem | P1 (hoje `crawlresult` cumpre papel próximo) |
| `discarded_items` | rejeitos com motivo | P1 |
| `modems` | 3 modems 4G físicos com IP/status | **P0** — base conceitual de todo o anti-ban |
| `accounts` | contas WA com afinidade fixa a modem | **P0** — substitui/estende `waaccount` |
| `group_category_affinity` | matriz grupo × categoria editável | P1 |
| `group_sent_history` | TTL 14d, base do anti-repeat 7d | **P0** |
| `redirect_domains` | 3-5 domínios com afinidade modem | P1 |
| `send_queue` | fila particionada por modem | **P0** |
| `send_log` | log de envios (substitui parte de `sentmessage`) | P0 |
| `ban_events` | log explícito de bans | P0 |
| `component_heartbeat` | health de Algo/Senders/Crawlers | P1 |
| `alert_rules` | SQL editável + cooldown | P1 |
| `learned_weights` | CTR/EPC 30d por (group, category, source) | **P0** (base do L1, ranking) |
| `daily_metrics` | agregação que sobrevive à retenção | P1 |
| `llm_actions` | auditoria de toda ação automática | **P0** (pré-requisito dos loops) |
| `llm_autonomy` | dead-man switch por loop | **P0** |
| `llm_suggestions` | sugestões pendentes pra dashboard | P1 |
| `system_pauses` | registro de pauses sistêmicos | P1 |
| `taxonomy_rules` | regras com trust_score + applications/contradictions | P1 (existe `taxonomy`/`taxonomy_pattern` com schema diferente — migrar) |
| `scraper_configs` | seletores versionados + shadow | P1 |
| `extraction_logs` | base do `success_rate` por field | P1 |
| `tunable_parameters` | parâmetros learnables com bounds | **P0** (10 params + função `get_param`) |
| `parameter_ab_tests` | A/B de parâmetros (L8) | P2 |
| `group_conversion_features` | features descobertas pelo L9 | P2 (L9 habilita só após 60d de conversões) |

### Tabelas existentes não-cimentadas (avaliar)

| Tabela | Função atual | Recomendação |
|---|---|---|
| `users`, `refresh_tokens` | Auth JWT admin | **Manter** — specs assumem operação humana via dashboard |
| `appconfig` | Singleton com config dinâmica | **Manter** transitório; migrar configs estáticas pra env, dinâmicas pra `tunable_parameters` |
| `tgaccount`, `telegramchat` | Suporte Telegram | **Decidir com Pedrinho** (specs falam só WA) |
| `channel`, `channelrule`, `channeltarget`, `channel_target_accounts`, `channel_automations` | Camada de regras de envio + grupos por canal | **Provavelmente descontinuar** após `groups` + `templates` cimentados — risco grande de dual-write; agendar deprecation depois da Fase 4 |
| `auto_match_logs`, `recommendation_cache` | Logs do AutoMatch + cache de recomendações | Reaproveitar como base do Algo tick novo; migrar para `daily_metrics` + `send_queue` |
| `jonfrey_actions`, `jonfrey_config`, `jonfrey_review_cache` | LLM review semi-automático com human-in-the-loop | **Manter como L4 ou substituir** pelos loops cimentados — Pedrinho decide se isso vira interface de aprovação do L4 ou some |
| `ads`, `clicklog` (ads), `broadcastmessage` | Anúncios pagos + broadcast | Não está nas specs; **manter** se Pedrinho ainda usa, isolar do pipeline principal |
| `group_spies`, `spy_messages` | Crawler de grupos concorrentes | **Não está nas specs mas pode virar fonte de learning.** Manter, fora do hot path |
| `clusters` | Análise semanal de audiência | **Não está nas specs.** Pode virar input do L9 (features por grupo). Manter |
| `compose_cache` | Cache de previews LLM | Útil, manter |
| `groupingkeyword` | Grouping legacy | Avaliar deprecation |
| `product`, `pricehistoryv`, `sentmessagev`, `scanjob`, `clicklog` (v1), "group" (com aspas), `sentmessage` (v1) | Tabelas legacy v1 | **Deprecar** após confirmação de que ninguém lê |
| `crawllog`, `crawlresult` | Log de crawl + resultado bruto | Mantém função similar a `raw_items` cimentado; **mapear/renomear** |
| `searchterm` | Query-based crawl input | Coexiste com `pages` cimentado. **Manter** (busca por termo é útil); `pages` cobre crawl por URL fixa |
| `affiliates`, `affiliate_programs`, `affiliate_postbacks` | Programas de affiliate | Não cimentado, mas útil. Manter, alinhar com `sources.config` |
| `public_links`, `public_link_clicks` | Links públicos com fallback chain | Não cimentado. Manter, vira parte do redirector futuro |
| `short_links`, `shortlink_clicks` | Shortener atual | **Manter como base do `redirect_domains`** — adicionar campo `domain_id` e popular `clicks` cimentado |
| `background_jobs` | Fila de jobs | Manter ou renomear pra `jobs` |
| `llm_cache`, `llm_metrics`, `llm_op_budgets` | Infra LLM existente | **Manter — ótima base** pra wiring dos 9 loops |
| `taxonomy`, `taxonomy_pattern`, `catalogproduct_taxonomy` | Sistema de taxonomia atual com pattern matching | **Migrar para `taxonomy_rules`** mantendo dados via shim |

---

## Loops LLM

**9 cimentados + curator** — todos têm requisito de schema (`llm_actions`, `llm_autonomy`, `llm_suggestions`) + DeepSeek V4 Flash como provider default.

| Loop | Nome cimentado | Estado no projeto | Gap |
|---|---|---|---|
| **L1** | `affinity_adjust` — ajustar `group_category_affinity` baseado em EPC | **Ausente** | Não há matriz de afinidade editável. `match.Weights` é hardcoded; sem EPC; sem rollback |
| **L2** | `template_ab` — A/B testing de templates com shadow | **Ausente** | Tabela `templates` inexistente. Sem mecanismo de A/B |
| **L4 (a)** | `cooldown_suggest` — sugestões na dashboard | **Ausente** | `tunable_parameters` inexistente. Sem dashboard de sugestões. Jonfrey é o mais próximo, mas escopo diferente |
| **L4 (b)** | `cap_suggest` — idem para cap diário | **Ausente** | Idem |
| **L5** | `taxonomy_grow` — auto-criação de regras com trust score | **Parcial** | `taxonomy` + `taxonomy_pattern` existem e há classificação LLM. Falta: `trust_score`, `applications`, `contradictions`, source `'llm_generated'`, ciclo de promoção/quarentena. **Já está em curso** — viável evoluir incrementalmente |
| **L6** | `anomaly_pause` — pause automático em anomalia | **Ausente** | Sem `mv_anomaly_signals`, sem `system_pauses`, sem auto-pause |
| **L7** | `scraper_fix` — drift auto-fix com shadow | **Ausente** | `scraper_configs` inexistente; seletores hardcoded nos arquivos Go (`internal/scrapers/*.go`); sem `extraction_logs` |
| **L8** | `auto_tuning` — A/B de parâmetros | **Ausente** | `tunable_parameters` inexistente. Pré-requisito de L4 |
| **L9** | `content_optimize` — feature learning por grupo | **Ausente** | `group_conversion_features` inexistente. **Bloqueado por 60d de conversões acumuladas** (depende de Fase 2) |
| **Curator** | classifica eventos pros 2 grupos WA | **Ausente** | Nenhum sistema de alertas WA dedicado. `internal/notifier` é primitivo. Conta dedicada inexistente |

**Salvaguardas presentes**: 0 dos 9. Não há `llm_actions`, `llm_autonomy` (strikes/dead-man), nem rollback automático com métrica objetiva.

**O que tem hoje (perto-mas-não-é)**:
- `jonfrey_*` — review LLM com aprovação humana. Conceitualmente próximo do L4 (sugestões), mas escopo é review/curation de produtos, não tuning de parâmetros.
- `llm_op_budgets` + `llm_metrics` + `llm_cache` — boa base de observabilidade que pode receber as métricas dos loops.

---

## Pipeline funcional atual (snapshot)

| Estágio | Estado | Como funciona hoje |
|---|---|---|
| **Ingestão** | Funciona | `SearchTerm`-based: usuário define termo + fontes + intervalo. Scrapers Go (HTTP + alguns Chromium para Amazon). Resultado vai pra `crawlresult` → pipeline → `catalogvariant` |
| **Anti-bot** | Mínimo | Headers Chrome 131 + Sec-Ch-Ua + cookie env (`cf_clearance`). Sem stealth, sem fingerprint rotation, sem rate limit por source/jitter, sem roteamento por modem (modems nem existem) |
| **Catálogo** | Funciona | `catalogproduct` (pai) + `catalogvariant` (variants com `short_id`). `pricehistory` populada. Sem `dedup_key`/`content_hash` formalizados |
| **Triagem** | Funciona | `pipeline/process.go` + `taxonomy` (regras manuais e via LLM) + `match` (pesos hardcoded). LLM fallback existe |
| **Seleção** | Funciona com ressalvas | `auto_match_worker` roda a cada 15s, lê produtos recentes, calcula score por canal, dispara para grupos. **Sem janela 21h-6h**, sem pacing diluído, sem epsilon-greedy, sem `learned_weights` |
| **Fila de envio** | Funciona | `dispatch_targets` — fila por target (group). 1 worker único, sem partition por modem |
| **Sender** | Funciona | `dispatch_worker` (15s tick) → Evolution API → WhatsApp. TG bot paralelo |
| **Cooldown** | Implícito | Não há cooldown 90s ±30s explícito por conta WA. Há `dispatch_send_window` por grupo e `dispatch_max_per_group_per_hour` |
| **Detecção de ban** | Mínima | `consecutive_failures` no `waaccount` + `appconfig_antiban`. Sem `ban_events`, sem auto-pause de modem, sem reassignment |
| **Redirect/affiliate** | **Bom** | `internal/redirect` resolve `/r/:short_id` → canonical URL + injeção de tag. Cache 1h. **Próximo do cimentado** |
| **Click tracking** | Funciona | `shortlink_clicks` + `clicklog`. Sem fraud filter (rate-limit IP / UA blacklist / behavior) |
| **Conversion tracking** | Mínimo | `affiliate_conversions` simples (program, click, external_order, revenue, status). **Sem webhook handlers por source**, sem `learned_weights` consumidor. Não fecha o loop click→venda→`epc_30d` |

### Sources / Crawlers ativos

- **Funcionando**: ML, Amazon, Awin, Shopee, Shein, Magalu (com testes em alguns)
- **Existem mas estado incerto**: AliExpress, Humble, Kinguin, retail_brazil
- **Faltando**: scrapers cimentados são Amazon/ML/Shopee/Awin/CDKey — **CDKey ausente** (não há scraper)

---

## Operacional

| Item | Status | Nota |
|---|---|---|
| Mac mini configurado? | **Não verificado** | Stack mira Raspberry Pi (`docker-compose.yml` tem `shm_size`, perfis para arm64, watchtower) |
| Coolify rodando? | **Provável** | Pasta `coolify/` + `.github/workflows` com release pra ghcr.io + Watchtower. Não foi verificado se Coolify orquestra |
| Modems 4G | **Inexistentes no código** | Zero menções a `modem`, `usb0`, interfaces. Conceitualmente *gap principal* |
| Contas WhatsApp ativas | **Múltiplas suportadas** | `waaccount` aceita N rows; Evolution API é multi-instance. Sem afinidade modem → conta |
| Grupos rodando | **N rows** | `groups` permite plataforma WA/TG. Estrutura existe |
| Cloudflare | **Configurado** | `cloudflared` no compose com tunnel via token. Page Rules / Custom Rules não visíveis no repo (vivem no dashboard CF) |
| Backup / restore | **Não testado** | Sem evidência de runbook ou cron de backup do Postgres |
| Postgres | **16 (app)** + **15 (Evolution)** | Specs falam 15+. Compatível |
| LLM provider | **OpenRouter** (default) | Specs falam DeepSeek V4 Flash direto. Migrar provider config ou rotear via OpenRouter |

---

## Prioridades sugeridas

Reordenação proposta do roadmap do brief, baseada no gap analysis:

**Fase 0 (agora)**: este documento + aprovação Pedrinho.

**Fase 1 — Foundation aditiva (≈ 2 sprints)**
- Criar `categories` + seedar 5 categorias cimentadas
- Criar `modems` + seedar 3 modems
- Adicionar `accounts` (espelho enriquecido de `waaccount` com `modem_id`, `status` cimentado, `daily_send_quota`, `consecutive_failures`)
- Adicionar `group_sent_history` (TTL 14d) — habilita anti-repeat correto
- Adicionar `learned_weights` (vazia inicialmente)
- Adicionar `tunable_parameters` + função `get_param()` + 10 seeds globais
- Adicionar `llm_actions`, `llm_autonomy`, `llm_suggestions`, `system_pauses` (pré-requisito de qualquer loop)
- Adicionar `component_heartbeat`, `alert_rules`
- Adicionar `daily_metrics` + job que popula `sent/clicks/conversions/bans/epc`
- Migrations testadas em dev; backup + restore validados antes de migrar prod

**Fase 2 — Conversion Tracking (P0 do brief)**
- Criar `conversions` cimentada
- Webhook handlers por source (Amazon polling, ML, Awin, Shopee polling). Auth `subid` ↔ `short_id`
- Fraud filter em `clicks` (criar `clicks` unificada; popular via shim no redirector)
- Job de refresh de `learned_weights.epc_30d` consumindo `conversions`
- **Definition of Done**: pelo menos 1 source com conversões chegando end-to-end; `learned_weights` populando

**Fase 3 — Catálogo cimentado**
- Criar `catalog` + script de fold a partir de `catalogvariant`
- Adicionar `dedup_key`, `content_hash`, `quality_score`, `price_anchor_30d`, `canonical_url_alive`
- Job `recompute_quality_scores` (1h)
- Migrar `pricehistory` → `price_history` (renome + projeção)
- `discarded_items` populando

**Fase 4 — Senders + Anti-ban**
- Criar `send_queue` + `send_log` + `ban_events` + `redirect_domains`
- Refatorar `dispatch_worker` em 3 senders (1 por modem) com FOR UPDATE SKIP LOCKED, cooldown 90s ±30s, rotação
- Detecção de ban + reassign automático; pause de modem
- Reaper de locks abandonados; check CGNAT 5min
- Janela 21h-6h America/Sao_Paulo no Algo
- Templates A/B funcionando (com tabela `templates`)

**Fase 5 — Loops LLM core**
- L5 finalizar (taxonomy_grow já tem 60% — só falta `trust_score` + ciclo)
- L7 scraper_fix (com `scraper_configs` versionado)
- L2 template_ab
- L6 anomaly_pause
- L1 affinity_adjust (EPC-driven)

**Fase 6 — Sistema de alertas WhatsApp**
- 2 grupos WhatsApp dedicados + conta dedicada
- Curator LLM (5min)
- Bot interpretando respostas em PT-BR
- Relatório diário 08h

**Fase 7 — Loops avançados**
- L4 (cooldown + cap suggest na dashboard)
- L8 auto_tuning
- L9 content_optimize (só após 60d de `conversions` acumuladas)

**Fase 8 — Diferenciais**
- Imagens nas mensagens, sentimento, A/B horário, detecção precoce de morte de grupo

---

## Riscos identificados

1. **Coexistência de schemas**: catalog antigo (`catalogproduct/catalogvariant`) + novo (`catalog`). Risco de dual-write criando inconsistência. **Mitigação**: tabela nova é read-only do antigo durante migração; cutover único quando todos os consumidores atualizarem.
2. **`groups` divergente**: cimentado não tem `channel_id`. Strangler para descontinuar `channel`/`channelrule` exige reescrita de boa parte da admin UI. **Mitigação**: manter colunas legacy + `whatsapp_jid`/`category_id` adicionais até frontend migrar.
3. **Dispatcher único → 3 senders**: refactor não-trivial. Risco de double-send durante transição. **Mitigação**: flag de feature em `tunable_parameters`; manter dispatcher antigo desativado por flag até validar.
4. **Modems não existem fisicamente?** Se Pedrinho ainda não tem os 3 modems 4G conectados no Mac mini, modelar antes da hardware estar pronta cria ficção. **Decisão**: confirmar com Pedrinho — se hardware atrasa, Fase 4 fica bloqueada, mas Fases 1-3 e 5 (parcial) seguem.
5. **Telegram em produção**: se ainda há grupos TG ativos, descontinuar bruscamente perde audiência. **Mitigação**: deprecation gradual; Fase 6 cobre alertas via conta dedicada que pode ser TG ou WA, mas grupos de promoção são WA-only no cimentado.
6. **Jonfrey vs L4**: se Pedrinho usa Jonfrey hoje, sobrepor com L4 sem coordenação cria duplicação. **Decisão**: Pedrinho confirma se Jonfrey vira interface de aprovação do L4 ou some.
7. **Provider LLM**: trocar OpenRouter → DeepSeek V4 Flash direto pode quebrar custos calculados em `llm_op_budgets`. **Mitigação**: manter OpenRouter como rota com DeepSeek V4 Flash forçado; rever budgets.
8. **`scrapers` Go vs Playwright Python**: anti-bot 7 camadas do cimentado pressupõe stealth headless real. Stack Go atual usa só HTTP + headers. Se Shopee/ML bloquearem, migrar pra microsserviço Python (mencionado no brief) é refactor grande. **Mitigação**: medir taxa de bloqueio antes; só migrar se precisar.
9. **CGNAT real**: cimentado pressupõe IP residencial. Se Mac mini fica atrás de CGNAT do ISP, `check_ip` 5min e detecção de troca dependem de endpoint externo. **Mitigação**: usar `https://ifconfig.io` ou similar, com retry.
10. **Backup nunca testado**: cimentado exige "backup + restore mensal testado". Não há cron ou runbook hoje. **Mitigação**: Fase 1 já cria cron + runbook + um restore real em ambiente isolado.

---

## Perguntas em aberto

Itens que precisam decisão do Pedrinho **antes** de avançar pra Fase 1:

1. **Hardware**: o Mac mini está ligado e os 3 modems 4G já estão conectados via USB hub? Se não, em que prazo? Isso bloqueia toda a Fase 4.
2. **Telegram**: descontinuar suporte TG no pipeline de promoções? Manter só pros 2 grupos de alertas (Fase 6 sugere "conta dedicada" — pode ser TG)?
3. **Jonfrey**: virar UI de aprovação do L4 (cooldown_suggest + cap_suggest), virar um 10º loop não-cimentado a manter por enquanto, ou ser desativado?
4. **Channel/ChannelRule/ChannelAutomation**: posso planejar deprecation completa após Fase 4 e fazer a migration de groups remover `channel_id`? Ou esse modelo ainda é central pra operação?
5. **AutoMatch atual**: vira o "Algo tick" cimentado (com refactor das 5 camadas), ou é descontinuado em favor de um worker novo do zero (deixando AutoMatch como legado por X tempo)?
6. **Ads + Broadcast**: ainda são features ativas? Mantenho off do hot path da fase 1?
7. **Group_spies**: virar fonte de learning pro L5/L9 ou ficar isolado? Tem dados úteis acumulados?
8. **Provider LLM**: posso plumbing DeepSeek V4 Flash direto no `llm_config` (mantendo OpenRouter como rota fallback), ou Pedrinho prefere continuar OpenRouter por simplicidade de billing?
9. **Migration tool**: continuo no formato `-- migrate:up/-- migrate:down` do projeto (dbmate-like) com numeração sequencial (próxima seria `0137`)? Ou migrar pra `golang-migrate` com timestamp?
10. **Renomeação `background_jobs` → `jobs`**: posso fazer? Há código externo (frontend) que lê `background_jobs` direto?
11. **CDKey scraper**: cimentado lista CDKey como source. Já existe scraper de algum CDKey vendor (Humble/Kinguin estão lá). Mapeio Kinguin/Humble como `source='cdkey'` ou crio source separado?
12. **Deploy**: Coolify continua sendo o orquestrador no Mac mini (substituindo o atual deploy em Pi via Watchtower)?
13. **Frontend split**: o `docs/split-admin-public.md` menciona separar admin/public — esse split entra antes ou depois da Fase 4?
14. **JJ vs Git**: o repo está no GitHub e usa `git` na superfície. O brief diz "JJ commits descritivos". Confirmo que devo usar JJ localmente (`jj git fetch`/`jj describe`/`jj git push`) mantendo histórico Git legível?
15. **Conta dedicada pros 2 grupos de alertas (Fase 6)**: número novo de WhatsApp Business é responsabilidade do Pedrinho providenciar antes da Fase 6?

---

## Próximo passo (aguardando aprovação)

Se este Gap Analysis for aprovado, proponho:

1. **Pedrinho responde as 15 perguntas em aberto** (mesmo que com "decidir depois" para algumas).
2. **Crio `PLAN_FASE_1.md`** detalhando exatamente quais migrations entram, em que ordem, com schema completo (não placeholders), incluindo `DEFINITION_OF_DONE` da Fase 1 do brief.
3. **Só depois disso** abro mudanças no banco (em dev primeiro, backup + restore validado, daí prod).

**Stop here. Aguardando aprovação.**
