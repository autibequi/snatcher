# Promo Snatcher

Varredor automático de preços (Mercado Livre + Amazon) com pipeline inteligente e envio para WhatsApp + Telegram.

## Manual para quem nunca usou o sistema

Se vais **só operar o painel** (sem instalar servidor), começa pelo **[docs/MANUAL.md](docs/MANUAL.md)** — explica conceitos (crawler, catálogo, canal, grupo), o caminho sugerido até ao primeiro envio e onde está cada coisa no menu. O mesmo manual operacional existe dentro da app em **Sistema → Manual** e no ícone **❓** na barra.

---

## Início rápido

```bash
git clone git@github.com:usuario/promo-snatcher.git
cd promo-snatcher
make setup       # cria .env e gera segredos automáticos
nano .env        # preencher: AUTH_PASSWORD, EVOLUTION_API_KEY, PUBLIC_URL
make dev         # ou `make start` para produção
```

Acesso:
- Admin: `http://localhost:8000` (painel de configuração)
- Frontend: `http://localhost:6060` (SPA pública — em transição para split)
- Evolution QR: `http://localhost:3200` (WhatsApp)

## Variáveis obrigatórias no .env

| Variável | Descrição |
|---|---|
| `AUTH_PASSWORD` | Senha do painel admin |
| `EVOLUTION_API_KEY` | Chave da API WhatsApp |
| `PUBLIC_URL` | URL pública (usada nos shortlinks das mensagens) |
| `AUTH_SECRET` | Gerado automaticamente pelo `make setup` |
| `DATABASE_URL` | Postgres 16 (padrão em docker-compose) |

Ver `.env.example` para todas as variáveis opcionais (GA, afiliados, LLM, etc.).

## Database

O backend Go usa **PostgreSQL 16** com Postgres interno para Evolution API.

```bash
# Dev local com Docker Compose
make dev                  # sobe postgres + backend + frontend

# Migrations
cd backend-go && make migrate

# Seed admin
make admin                # pergunta email e senha
```

## Comandos principais

```
make setup              Primeira execução: cria .env + gera AUTH_SECRET
make dev                Dev com hot-reload (postgres + backend + frontend)
make start              Produção: compila local + sobe tudo
make start-tunnel       Produção + Cloudflare Tunnel (acesso externo)
make deploy             Pi: pull imagens + sobe (sem compilar)
make logs               Logs em tempo real
make status             Status resumido + próximo scan
make health             Smoke test HTTP (saúde da stack)
make shell              Shell no container do backend
```

Mais: `make help` lista todos os 40+ comandos.

## Estrutura

```
backend-go/
├── cmd/
│   ├── server/         # admin API (porta 8000, com auth)
│   ├── public/         # shortlinks & public API (porta 8001, sem auth)
│   ├── migrate/        # rodar migrations
│   ├── seed/           # seed de dados
│   └── llm-eval/       # ferramentas de avaliação
└── internal/
    ├── handlers/       # handlers HTTP
    ├── store/          # repository & SQL
    ├── pipeline/       # crawl → process → evaluate
    ├── scheduler/      # APScheduler-like (goroutines)
    ├── scrapers/       # ML, Amazon, Magalu, Shopee, Shein, AliExpress, Humble, Kinguin, Awin
    ├── messaging/      # WhatsApp (Evolution) + Telegram
    ├── llm/            # integração OpenRouter
    ├── models/         # structs do domínio
    └── ... (redirect, auth, config, etc.)

frontend/              # React 18 + Vite + TailwindCSS (SPA único hoje)
docker-compose.yml     # stack: postgres, evolution, redis, backend, frontend
```

## Pipeline

```
SearchTerm → CrawlResult → CatalogProduct/Variant → ChannelRule → WA/TG
```

1. **SearchTerm**: query, intervalo, fontes (ML/Amazon)
2. **CrawlResult**: resultado bruto (título, preço, URL)
3. **CatalogProduct/Variant**: normalização + dedup + histórico de preço
4. **ChannelRule**: match (tag/brand/search_term) + triggers (new/drop/lowest)
5. **Envio**: WA via Evolution API ou Telegram bot

## Cloudflare Tunnel (acesso externo)

```bash
# Gerar token em: dash.cloudflare.com > Zero Trust > Networks > Tunnels
# Adicionar ao .env:
CLOUDFLARE_TOKEN=<seu-token>

make start-tunnel
```

Veja [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md) para configuração detalhada dos hostnames `admin.jon.promo` e `jon.promo`.

## Raspberry Pi

```bash
# 1. Instalar Docker
make pi-setup

# 2. Configurar .env (PUBLIC_URL com IP ou domínio do Pi)
nano .env

# 3. Deploy (pull imagens pré-compiladas)
make deploy          # ou `make deploy-tunnel` com Cloudflare
```

Consumo esperado: ~1.5 GB RAM. Recomendado: Pi 4 com 4 GB.

Watchtower atualiza containers automaticamente a cada 15 min.

## API

Docs interativa: `http://localhost:8000/api/swagger` (OpenAPI 3.0)

Saúde: `GET /api/health`

## Planejado

- Split em hosts separados: `admin.jon.promo` (painel CRUD) / `jon.promo` (public site + shortlinks), compartilhando apenas o Postgres
- Frontend em dois bundles Vite (admin + public) sem fork de código
- Postgres role read-only dedicada para `cmd/public`
- Reorg `internal/handlers/{admin,public}/` para reduzir surface de leak
- Normalização de títulos com fuzzy matching mais forte
