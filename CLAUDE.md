# Promo Snatcher — CLAUDE.md

Varredor automático de preços (Mercado Livre + Amazon) com pipeline de 3 camadas e entrega inteligente para **WhatsApp + Telegram**.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Go (chi, sqlx) + PostgreSQL 16 |
| Scrapers | `net/http` + `PuerkitoBio/goquery` (HTML parsing) — sem browser headless |
| Sources | mercadolivre, amazon, magalu, shopee, shein, aliexpress, humblebundle, kinguin, awin |
| Messaging | WhatsApp via Evolution API; Telegram via `go-telegram-bot-api/v5` |
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| Infra | Docker Compose + Cloudflare Tunnel |
| Auth | JWT (custom, `internal/auth`) |
| Observability | Prometheus metrics + structured logs |

## Arquitetura

### 2 Binários Backend

- **`cmd/server`**: Admin API (porta 8000) — CRUD SearchTerm/ChannelRule/CatalogProduct com auth JWT
- **`cmd/public`**: Shortlinks & public API (porta 8001) — sem auth; usada pelos bots de redirecionamento
- Compartilham postgres + scheduler: pipeline executa a cada `SCAN_INTERVAL` minutos

### Pipeline (3 Camadas)

```
CRAWL  →  CATALOG  →  DELIVER

SearchTerm → CrawlResult → CatalogProduct/Variant → Channel(Rules) → WA/TG
```

**CRAWL**: `SearchTerm` (query, price range, sources, interval) → scraper (ML/AMZ) → `CrawlResult` (título, preço, URL)

**CATALOG**: CrawlResult → `CatalogProduct` (canonical) + `CatalogVariant` (URL/cor/sabor) + auto-tag (LLM or keyword) + `PriceHistoryV2`

**DELIVER**: ChannelRule (match + trigger) → evento (new/drop/lowest) → send WA via Evolution API / TG via `go-telegram-bot-api`

### Estrutura `backend-go/internal/`

```
handlers/     HTTP handlers (admin CRUD + público shortlinks)
store/        SQL repository (sqlx)
pipeline/     crawl → process → evaluate
scheduler/    goroutine-based scan ticker
scrapers/     mercadolivre, amazon, magalu, shopee, shein, aliexpress, humblebundle, kinguin, awin
messaging/    adapters: WA (Evolution) + TG (go-telegram-bot-api)
adapters/     external service clients (telegram, evolution)
llm/          OpenRouter integration (auto-tag, eval)
router/       chi router setup (admin + public)
models/       domain structs
auth/         JWT
middleware/   logging, auth, error handling
db/           connection pool + embedded migrations
redirect/     shortlink resolver (cache + Postgres)
spy/          telegram observer
match/        product matching
```

## Comandos

```bash
make dev         # Dev: postgres + backend + frontend (hot-reload)
make start       # Produção: compila local + sobe tudo
make deploy      # Pi: pull imagens do ghcr.io + sobe
make logs        # Follow logs
make status      # Container status + scheduler next run
make health      # Smoke test (health check, swagger, metrics)
make shell       # bash no backend container
make admin       # Criar/atualizar usuário admin (pergunta email+senha)

# Backend Go (delegado ao backend-go/Makefile)
make backend-test       # go test
make backend-build      # go build
make backend-vet        # go vet
```

## Variáveis de Ambiente (.env)

```env
# Obrigatórias
AUTH_PASSWORD=            # senha painel admin
AUTH_SECRET=              # JWT secret (gerado por make setup)
EVOLUTION_API_KEY=        # WhatsApp API key
PUBLIC_URL=               # URL pública (shortlinks)

# Banco de dados
DATABASE_URL=postgres://snatcher:devpass@snatcher-app-postgres:5432/snatcher
SNATCHER_DB_PASS=devpass

# Infraestrutura
EVOLUTION_INSTANCE=default
EVOLUTION_DB_PASS=evolution
SCAN_INTERVAL=30          # minutos
TZ_NAME=America/Sao_Paulo

# Opcionais
CLOUDFLARE_TOKEN=         # acesso externo
AMZ_TRACKING_ID=          # Amazon Associates
ML_AFFILIATE_TOOL_ID=     # ML Afiliados
TG_BOT_TOKEN=             # Telegram
GA_MEASUREMENT_ID=        # Google Analytics
OPENROUTER_API_KEY=       # LLM (OpenRouter)
LLM_DEFAULT_MODEL=openai/gpt-4o-mini
LLM_BUDGET_USD_DAILY=5.0

# White-label (planejado para split)
APP_DOMAIN=beta.autibequi.com
APP_NAME=Snatcher
```

## Arquivos Docker Compose

- `docker-compose.yml`: Produção (ghcr.io images)
- `docker-compose.dev.yml`: Dev com hot-reload
- `docker-compose.snatcher.yml`: Build local (override)

Serviços: evolution + evo-postgres + evo-redis + postgres + backend + frontend + cloudflared (tunnel) + watchtower (auto-update)

## Planejado

- Split: `admin.jon.promo` (painel CRUD) / `jon.promo` (public site + shortlinks)
- Melhorias de LLM eval (compose normalizado, detecção fuzzy)
- Scrapers adicionais (eBay, Shein, etc.)
