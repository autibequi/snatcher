# coolify/ — deploy do Snatcher via Coolify UI

Stack adaptado pra rodar no Coolify self-hosted (do repo `autibequi/nuvem`), exposto em `snatcher.autibequi.com` via Cloudflare Tunnel global.

Não substitui o `docker-compose.yml` raiz (que continua sendo o stack do Pi com `cloudflared`/`watchtower` próprios). Este aqui é dedicado ao Coolify.

## O que muda vs o compose raiz

| Mudança | Por quê |
|---|---|
| Sem `cloudflared` | Reusa o tunnel global do `nuvem` |
| Sem `watchtower` | Coolify rebuilda em redeploy (manual ou via webhook GitHub) |
| Sem `redirect` | Já integrado no backend-go |
| Sem `container_name` | Coolify renomeia containers; DNS interno resolve via service-name |
| Bind `./backend-go/data` → volume `snatcher-data` | Coolify clona o git em diretório efêmero — bind perde dados a cada redeploy |
| `frontend` em network `nuvem_nuvem` external com alias `snatcher-frontend` | CF Tunnel acessa via DNS interno — alias estável |
| `nginx.conf` versionado + `Dockerfile.frontend` que estende a imagem oficial | A imagem `ghcr.io/autibequi/promosnatcher-frontend:latest` foi buildada com hostnames antigos (`promo-snatcher-backend`, `promo-snatcher-evolution`); o Dockerfile local copia o `nginx.conf` corrigido (service-names `backend`/`evolution`) por cima — sem precisar republicar a imagem original. Build é feito pelo Coolify em cada redeploy (rápido, só uma camada COPY) |

## Estrutura

```
coolify/
├── docker-compose.yml   evolution + evo-postgres + evo-redis + backend + frontend
├── Dockerfile.frontend  estende a imagem oficial e injeta o nginx.conf corrigido
├── nginx.conf           override pro nginx do frontend (resolver Docker + service-names atuais)
├── .env.example         template de envs
└── README.md            este arquivo
```

## Banco

- **App**: SQLite em `/app/data/app.db` no volume `snatcher-data` (Docker named volume, sobrevive a redeploy)
- **Evolution**: Postgres dedicado (`evo-postgres`) com schema `evolution_api` + Redis (`evo-redis`)

Sem Coolify-managed DBs — SQLite é arquivo (não tem instance), e o Postgres aqui serve só ao Evolution.

## Setup

### 1) Coolify UI

1. Coolify → **Project** novo (`snatcher`) → **+ New Resource** → **Application**
2. **Public Repository**: `https://github.com/autibequi/snatcher`
3. **Branch**: `main`
4. **Build Pack**: `Docker Compose`
5. **Base Directory**: `/coolify`
6. **Docker Compose Location**: `/docker-compose.yml`
7. **Environment Variables**: copiar `.env.example` e preencher os 3 obrigatórios:
   - `AUTH_PASSWORD` ← senha forte do painel admin
   - `AUTH_SECRET` ← `openssl rand -hex 32`
   - `EVOLUTION_API_KEY` ← `openssl rand -hex 24`
8. **Deploy**

### 2) Cloudflare Public Hostname

Painel CF → **Zero Trust** → **Networks** → **Tunnels** → tunnel da nuvem → **Public Hostnames** → **Add a public hostname**:
- Subdomain: `snatcher`
- Domain: `autibequi.com`
- Service: `HTTP` → `snatcher-frontend:80`
- Save

### 3) Validação

```bash
# Containers up no host
docker ps --filter name=snatcher --filter name=evo --format 'table {{.Names}}\t{{.Status}}'

# Backend healthy direto
BE=$(docker ps --filter ancestor=ghcr.io/autibequi/promosnatcher-backend --format '{{.Names}}' | head -1)
docker exec "$BE" wget -qO- http://localhost:8000/api/health

# Proxy via frontend (valida nginx.conf override)
FE=$(docker ps --filter ancestor=ghcr.io/autibequi/promosnatcher-frontend --format '{{.Names}}' | head -1)
docker exec "$FE" wget -qO- http://localhost/api/health

# Cloudflared resolve o alias
CF=$(docker ps --filter ancestor=cloudflare/cloudflared --format '{{.Names}}' | head -1)
docker exec "$CF" wget -qO- http://snatcher-frontend/api/health

# Browser
open https://snatcher.autibequi.com
```

### 4) Conectar WhatsApp (Evolution)

```bash
EVO=$(docker ps --filter ancestor=evoapicloud/evolution-api --format '{{.Names}}' | head -1)
docker logs "$EVO" 2>&1 | grep -A 30 "qr"
```

Ou expor temporariamente a porta 8081 do frontend (Evolution Manager) adicionando ao `frontend` no compose:
```yaml
    ports:
      - "127.0.0.1:8081:8081"
```

Aí SSH tunnel: `ssh -L 8081:localhost:8081 forninho` e abre `http://localhost:8081`.

## Operação

### Atualizar imagens

`:latest` muta. Coolify só pulla no redeploy:

1. Push da nova imagem em `ghcr.io/autibequi/promosnatcher-{backend,frontend}` (CI do snatcher faz isso em push pra `main`)
2. Coolify UI → Application → **Redeploy**

Pra automatizar: configurar webhook GitHub Actions → Coolify Deploy URL no fim do CI de publish.

### Backup

```bash
# SQLite
docker run --rm \
  -v <coolify-project>_snatcher-data:/data \
  -v $(pwd):/backup \
  alpine sh -c 'cp /data/app.db /backup/snatcher-$(date +%F).db'

# Postgres do Evolution
EVO_PG=$(docker ps --filter ancestor=postgres:15-alpine --format '{{.Names}}' | grep evo | head -1)
docker exec "$EVO_PG" pg_dump -U evolution evolution > evolution-$(date +%F).sql
```

## Troubleshooting

**`502 Bad Gateway` em `/api/*` ou `/r/*`**
- nginx do frontend não resolve `backend`. Confirma override:
  ```bash
  docker exec <frontend> cat /etc/nginx/conf.d/default.conf | grep -E "backend|evolution"
  ```
  Deve mostrar `set $backend http://backend:8000;` (sem `promo-snatcher-`).
- Se mostrar hostname antigo, o volume mount não pegou. Verifica se o Coolify clonou o repo com o `nginx.conf` no path certo (`coolify/nginx.conf`).

**Backend reinicia em loop**
- Faltam envs obrigatórios — `docker logs` no backend revela qual.

**Evolution não envia mensagem**
- WhatsApp não conectado (ver "Conectar WhatsApp")
- `EVOLUTION_API_KEY` divergente entre backend e evolution

**Short links 404**
- `PUBLIC_URL` errada — backend gera link com host errado e nginx não roteia.

**SQLite locked**
- Restart do backend pelo Coolify. Volume preservado.
