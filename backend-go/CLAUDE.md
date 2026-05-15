# Snatcher Backend-Go — CLAUDE.md

Sistema de automação de disparos de produtos para grupos WhatsApp/Telegram.
Stack: Go 1.23, PostgreSQL, Evolution API (WhatsApp), Chi router, Gocron.

## Arquitetura

```
cmd/
  server/      — Entrypoint principal (porta 8000)
  public/      — Modo público: só shortlinks (APP_MODE=public)
  migrate/     — CLI de migrations (up/down/status/goto/force)
  seed/        — Seed inicial (taxonomia, sources)

internal/
  handlers/          — HTTP handlers (recebem request, delegam, retornam response)
    admin/           — Endpoints autenticados (JWT)
    public/          — Endpoints públicos (shortlinks, webhooks)

  services/          — Regras de negócio (toda lógica fica aqui)
    adapters/        — Evolution API (WA)
    affiliates/      — Programas de afiliados (ML, Amazon, Awin)
    algo/            — Score Engine v2 (Thompson, MMR, epsilon, pacing)
    compose/         — Composição de prompts LLM (preview)
    curation/        — Scripts de curadoria de catálogo
    curator/         — Webhook dispatcher e alertas WA
    invitelinks/     — Fetch + cache de links WA
    jobs/            — Background jobs (PostgreSQL-persisted)
    llm/             — Clients LLM (OpenRouter, Ollama, vLLM)
    loops/           — Loops de autonomia LLM
    messaging/       — Abstração de gateways de mensagem
    notifier/        — Eventos + relatórios em grupo WA
    pipeline/        — Runner de crawl + orchestração
    prompts/         — Templates YAML de prompts
    redirect/        — Short link redirector (com prewarm)
    scheduler/       — Gocron (pipeline, jonfrey, sender, sync, GC)
    scraperbridge/   — Adaptador de scrapers externos
    scrapers/        — Implementações por marketplace (ML, AMZ)
    senders/         — 1 goroutine por modem (send_queue → Evolution)
    spy/             — Group spy crawlers

  repositories/      — Acesso a dados (só queries SQL, sem lógica)
    store.go         — Interface Store (contrato do repositório)
    sql_store.go     — Implementação PostgreSQL
    sql_*.go         — Queries por domínio (grupos, contas, catálogo, etc.)

  models/            — Structs de dados compartilhados (sem lógica)
  middleware/        — Auth, CORS, rate limit, métricas
  router/            — Chi router (Build + BuildPublic)
  auth/              — JWT (admin/user roles)
  db/                — PostgreSQL pool + RunMigrations (auto no startup)
  ws/                — WebSocket hub (Activity em tempo real)
```

## Regras de camada (TODO: refactor progressivo)

> As regras abaixo descrevem o **estado desejado**. O código atual ainda mistura
> lógica nos handlers. Ao editar, mova regras de negócio para `services/` e queries para `repositories/`.

### handlers/ — só HTTP
- Recebe request, valida input, chama service, serializa response
- **Proibido**: lógica de negócio, queries SQL diretas, cálculos de score
- Pode: `decodeBody`, `writeJSON`, `writeErr`, chamar métodos de `store.Store` para casos simples de CRUD puro

### services/ — toda a regra de negócio
- Orquestra fluxos de negócio, aplica regras, coordena múltiplos repositories
- **Proibido**: `http.ResponseWriter`, `*http.Request`, lógica de serialização HTTP
- Pode: acessar banco via `repositories`, chamar outros services, chamar adapters externos

### repositories/ — só queries
- Executa SQL e mapeia resultados para structs de `models/`
- **Proibido**: lógica de negócio, cálculos, validações de domínio
- Pode: JOIN complexos, transações, upserts — mas sem decisão de negócio

## Migrations

Rodam **automaticamente no startup** via `RunMigrations()`.
As migrations são **embedadas no binário** (`//go:embed migrations/*.sql`).
Para novas migrations aparecerem em produção: **rebuild + redeploy**.

Verificação de schema: `schema_migrations` tabela rastreia versões aplicadas.
Erros fatais: exit code 1 → deploy falha (Coolify detecta).
Erros idempotentes aceitos: `42P07` (dup table), `42701` (dup column), `42710` (dup object).

## Tabelas principais (schema v2 atual)

### Contas e modems
```
modems               — Hardware/host modems (id, slug, status, paused_until)
accounts             — Contas WA v2 (phone, modem_id, status, daily_send_quota)
  status: warming | backup | primary | quarantine | banned
```

### Grupos e canais
```
groups               — Grupos WA/TG v2 (id, channel_id, whatsapp_jid, status, daily_msg_cap)
channels_v2          — Canais lógicos agrupadores (name, quality_threshold, daily_cap)
channel_category_weights — Pesos por (channel_id, category_id) — sliders do operador
group_admins         — Vínculo grupo↔conta WA (group_id, account_type, account_id, added_at)
  !! SEM coluna priority — usar ORDER BY CASE status WHEN 'primary' THEN 0 ELSE 1 END
group_category_affinity — Afinidade aprendida (group_id, category_id, affinity 0..1)
```

### Catálogo
```
catalog              — Produtos canônicos v2 (dedup_key UNIQUE, short_id, category_id,
                       quality_score, send_ready, canonical_url_alive, price_current,
                       last_price_drop_at, price_original, discount_pct)
categories           — Categorias (id, display_name, slug)
sources              — Marketplaces (id, name, trust_score)
price_history        — Histórico de preços (catalog_id, price, seen_at)
group_shortlinks     — Shortlinks por (group_id, catalog_id) — atribuição determinística
  ensure_group_shortlink(catalog_id, group_id) — função PG que gera/reusa
```

### Fila e envios
```
send_queue           — Fila persistente (modem_id, group_id, catalog_id, score, status)
  status: pending | sending | sent | failed
send_log             — Histórico de envios (send_queue_id, group_id, catalog_id, sent_at)
group_sent_history   — Anti-repeat por dedup_key (group_id, dedup_key, sent_at, price_at_send)
```

### Score Engine
```
tunable_parameters   — ~25 parâmetros ajustáveis (scope_type, param_name, current_value)
  get_param(name, scope_type, scope_id) — função PG para ler
algo_status          — 1 linha: último tick (last_tick_at, last_error, last_enqueued)
learned_weights      — CTR/EPC por (group_id, category_id, source_id) — refresh horário
learned_weights_channel — Agregação canal-level para shrinkage hierárquico
bandit_arms          — Thompson Sampling por (group_id, category_id) — α, β, 3 cursores
bandit_arms_channel  — Thompson nível canal (para warm-start de grupos novos)
```

### Analytics
```
clicks               — Cliques em shortlinks (short_id, catalog_id, group_id, clicked_at)
conversions          — Conversões rastreadas (catalog_id, group_id, commission, occurred_at)
daily_metrics        — Snapshot diário (date, metric, dimension, value)
```

### Jonfrey e LLM
```
llm_actions          — Ações executadas via LLM (type, status, before/after snapshot)
llm_metrics          — Custo + tokens (model, tokens_in, tokens_out, cost_usd)
llm_suggestions      — Sugestões pendentes de aprovação (Fase 7)
```

### Configuração
```
appconfig            — Config global singleton (1 linha: WA provider, send hours, etc.)
templates            — Templates de mensagem (category, body com variáveis, weight)
redirect_domains     — Domínios de redirect anti-ban (host, active)
alert_rules          — Regras de alerta (query SQL → notification)
```

### Tabelas V1 DROPADAS (não referenciar!)
```
dispatches           — DROPADA em 20260520200002. Substituída por send_queue.
dispatch_targets     — DROPADA. Substituída por send_log.
auto_match_logs      — DROPADA. Substituída por send_log.
waaccount            — DROPADA. Substituída por accounts.
catalogproduct       — DROPADA (schema v1). Substituída por catalog.
catalogvariant       — EXISTE mas é v1 legado (ligada a catalogproduct).
```

Se um handler retornar `pq: relation "X" does not exist` para essas tabelas:
capturar erro 42P01 e retornar graceful skip, não falhar.

## Score Engine (algo/)

Pipeline por tick (cron `*/5 * * * *`, dentro da janela 21h–6h SP):

```
1. Gate: use_algo_tick = 1 (tunable_parameter)
2. InSendWindow() — janela 21h-6h horário SP
3. Advisory lock pg_try_advisory_xact_lock(8442) — singleton
4. Para cada grupo ativo com channel_id != NULL:
   a. ShouldEnqueueGroup() — verifica cap diário + pacing
   b. [Opcional] Thompson Sampling → escolhe categoria do canal
   c. selectTopKForGroup() — fórmula composta (7 termos, LEFT JOINs)
   d. applyMMR() — re-rank por diversidade (MMR)
   e. [Opcional] pickWithEpsilon() — exploração aleatória
   f. enqueueSend() — INSERT em send_queue via group_admins
5. recordTickResult() — atualiza algo_status
```

### Fórmula de score (select.go)
```
final_score = w_q * quality_score(p)                    -- 0.30 default
            + w_a * affinity(g, cat)                    -- 0.20
            + w_w * channel_weight(ch, cat) / 100       -- 0.15
            + w_c * (c * ctr_group + (1-c) * ctr_ch)   -- 0.15 (shrinkage hierárquico)
            + w_e * (c * epc_group + (1-c) * epc_ch)   -- 0.10
            + w_f * exp(-ln2 * hours / (half_life*24))  -- 0.05
            - w_s * (1 - decay^n_sent_24h)              -- 0.30 (subtraído)
```

Todos os `w_*` são tunables. `c` = confidence (learned_weights.confidence).

### enqueueSend — cuidados
```sql
INSERT INTO send_queue ...
SELECT a.modem_id, $1, $2, $3, now(), 'pending'
FROM accounts a
JOIN group_admins ga ON ga.account_id = a.id
WHERE ga.group_id = $1 AND a.status IN ('primary', 'backup')
ORDER BY CASE a.status WHEN 'primary' THEN 0 ELSE 1 END, ga.added_at ASC
LIMIT 1
```
⚠️ `group_admins` NÃO tem coluna `priority` — não usar ORDER BY ga.priority.

### Sender (services/senders/)
1 goroutine por modem (scheduler.go inicia N senders).
Dequeue de `send_queue` onde `status = 'pending'` e `modem_id = X`.
Envia via Evolution API. Registra em `send_log` e `group_sent_history`.

## Jonfrey — Ações e Tabelas Legadas

Jonfrey é o orquestrador LLM. Executa actions definidas em registry.
Actions que referenciam tabelas v1 (dropadas) recebem graceful skip automático
em `executeAction()` — erros 42P01 são convertidos em `status: success` + reasoning.

Actions ativas (tabelas v2):
- `inspect_pending_products`, `auto_curate_high_confidence`, `maintain_taxonomy`
- `refine_subcategories`, `enrich_taxonomy_from_unmatched` (se catalogproduct existir)
- `tune_thresholds`, `replenish_stagnant_crawlers`, `pause_dead_crawlers`
- `auto_release_pending` — no-op gracioso (sem tabela dispatches); sinónimo legado `enable_full_auto` resolve para o mesmo tipo

Actions com graceful skip (tabelas v1 dropadas):
- `archive_old_logs` → auto_match_logs
- `cleanup_dispatch_queue` → dispatches
- `manage_group_health` → dispatch_targets
- `purge_inactive_products` → catalogproduct
- `audit_affiliate_coverage` → catalogproduct
- `prune_false_positives` → auto_match_logs
- `reset_stale_cooldown` → auto_match_logs + dispatches

## Endpoints principais (router.go)

### Públicos (sem JWT)
```
GET  /api/health                   — Health check
GET  /api/brand                    — White-label config
POST /api/auth/login               — Login
POST /api/auth/refresh             — Refresh token
GET  /r/{shortID}                  — Redirect shortlink
GET  /v/{shortID}                  — Redirect com analytics
POST /webhooks/evolution           — Evolution webhook
POST /webhooks/awin                — Awin postback
POST /webhooks/mercadolivre        — ML postback
GET  /ws                           — WebSocket (auth via query param)
```

### Admin (JWT obrigatório)
```
# Score Engine
GET  /api/admin/algo/status        — Estado atual do tick
POST /api/admin/algo/toggle        — Liga/desliga use_algo_tick
GET  /api/admin/algo/dry-run       — Diagnóstico por grupo (sem enviar)

# Catálogo
GET  /api/catalog/search           — Busca por título (ILIKE)
GET  /api/catalog/{id}             — Produto + variantes
GET  /api/admin/catalog-canonical  — Lista com filtros

# Modems e contas
GET  /api/admin/senders/status     — Status por modem
GET  /api/admin/senders/accounts   — Contas por modem
POST /api/admin/modems/{id}/pause  — Pausar
POST /api/admin/modems/{id}/resume — Retomar
GET  /api/admin/modems/{id}/qrcode — QR code WA

# Fila e envios
GET  /api/admin/send-queue         — Fila (pendentes, enviados, falhas)
GET  /api/dashboard/upcoming-dispatches — Próximos da send_queue

# Métricas
GET  /api/admin/metrics/learned-weights — CTR/EPC por (grupo, categoria)
GET  /api/admin/metrics/virality        — Virality ratio por grupo
GET  /api/admin/metrics/daily           — Agregação diária
GET  /api/admin/metrics/ab-tests        — A/B tests ativos

# Canais
GET    /api/channels               — Lista
POST   /api/channels               — Criar
PATCH  /api/channels/{id}          — Atualizar
PUT    /api/channels/{id}/weights  — Salvar sliders de categoria
POST   /api/channels/{id}/groups/{groupId} — Vincular grupo
DELETE /api/channels/{id}/groups/{groupId} — Desvincular

# Grupos
GET    /api/groups                 — Lista
PATCH  /api/groups/{id}            — Atualizar
GET    /api/groups/{id}/admins     — Admins (contas WA vinculadas)

# Parâmetros
GET    /api/admin/parameters       — Lista tunables
PUT    /api/admin/parameters/{id}  — Atualizar value
POST   /api/admin/parameters/{id}/reset — Reset para default

# Dispatch manual
POST   /api/dispatch/manual        — Envio manual (sem Score Engine)
```

## Variáveis de Ambiente

```bash
DATABASE_URL=postgresql://...      # Obrigatório
PORT=8000
JWT_SECRET=<secret>                # Obrigatório
ENV=dev|prod
APP_MODE=full|public               # public = só shortlinks

# Evolution API (WhatsApp)
EVOLUTION_URL=http://...
EVOLUTION_API_KEY=<key>
EVOLUTION_INSTANCE=default

# LLM (opcional — sem chave usa nop client)
OPENROUTER_API_KEY=sk-...
LLM_DEFAULT_MODEL=openai/gpt-4o-mini

# Mercado Livre
ML_CLIENT_ID=<id>
ML_CLIENT_SECRET=<secret>

# White-label
APP_NAME=Snatcher
APP_DOMAIN=example.com
SCAN_INTERVAL=30                   # minutos entre crawls

# Observability
LOG_LEVEL=info
```

## Armadilhas e Decisões

### Grupos sem channel_id
O tick pula grupos com `channel_id = NULL`. Vincule o grupo a um canal em `/channels`.
`ChannelID` no struct deve ser `*int64`, não `int64` — o banco aceita NULL.

### Migrations embedadas
Novas migrations `.sql` só aparecem em produção após **rebuild do binário**.
`RunMigrations()` no startup aplica tudo automaticamente.
Errors em `ALTER TABLE` com tabelas inexistentes devem ser idempotentes (via isIgnorableError).

### Anti-repeat de 7 dias
`group_sent_history` bloqueia mesmo produto por 7d no mesmo grupo.
Bypass: `last_price_drop_at > last_sent_at` + queda >= 10% + cooldown 24h.

### Atribuição de cliques
`group_shortlinks` gera `short_id` único por `(catalog_id, group_id)`.
O redirect faz lookup determinístico — não usa mais "último grupo que enviou".
`ensure_group_shortlink(catalog_id, group_id)` é função PG que gera/reusa.

### Senders e cotas
`accounts.daily_send_quota` é a cota diária. `sent_today` incrementa a cada envio.
Ao atingir a cota, o sender pula a conta até meia-noite UTC.
Modems pausados (`modems.status = 'paused'`) não processam fila.

### Thompson Sampling
Flags: `use_thompson_sampling = 0` por padrão. Ligar só após 30d de dados.
Warm-start: novos arms herdam 25% do α/β do canal-mãe.
3 cursores independentes: `cursor_conversions`, `cursor_clicks`, `cursor_losses`.
Clicks capped: `LEAST(n, click_cap_per_member * member_count)` — anti-viralização.

### learned_weights join por source_id
`LEFT JOIN learned_weights lw ON lw.group_id=$1 AND lw.category_id=c.category_id AND lw.source_id=c.source_id`
**Nunca** usar AVG entre sources — mistura Amazon com Magalu.

## Como rodar localmente

```bash
# Banco de dados
export DATABASE_URL=postgresql://user:pass@localhost:5432/snatcher

# Subir
go run ./cmd/server

# Migrations
make migrate-up       # aplica pendentes
make migrate-status   # versão atual
make migrate-down     # reverte última

# Build (Dockerfile usa -tags=nosqlite)
go build -tags=nosqlite -buildvcs=false ./cmd/server
```
