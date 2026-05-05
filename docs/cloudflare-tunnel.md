# Cloudflare Tunnel — Configuração Multi-Host

Guia de setup do Cloudflare Tunnel para expor o Snatcher em dois hostnames com rotas específicas.

## Pré-requisitos

1. **Tunnel já criado** em [dash.cloudflare.com](https://dash.cloudflare.com) > Zero Trust > Networks > Tunnels
2. **Token do tunnel** obtido em Zero Trust: salvar em `.env` como `CLOUDFLARE_TOKEN`
3. **Domain delegado** na Cloudflare: `jon.promo` com nameservers apontando para CF

## Arquitetura

```
admin.jon.promo      →  cmd/server (admin API + frontend SPA) [porta 8000]
jon.promo            →  cmd/public (shortlinks + public API)   [porta 8001]
```

A separação impede leak do painel admin via domínio público.

## Configuração no Zero Trust Dashboard

1. Acesse: dash.cloudflare.com > Zero Trust > Applications > Tunnels
2. Selecione seu tunnel
3. Configure **Ingress Rules** (ordem importa):

| Hostname | Path | Destination | Descrição |
|----------|------|-------------|-----------|
| `admin.jon.promo` | `/api/.*` | `http://snatcher-backend:8000` | Admin API |
| `admin.jon.promo` | (default) | `http://snatcher-frontend:80` | Admin SPA |
| `jon.promo` | `/r/.*` | `http://snatcher-public:8001` | Shortlink redirect |
| `jon.promo` | (default) | `http://snatcher-public:8001` | Public site |
| (catch-all) | — | `http_status:404` | Not Found |

**Importante**: Regras são avaliadas de cima pra baixo. Colocar paths específicos antes de defaults.

## Alternativa: `config.yml` Local

Se preferir versionamento + CI/CD (em vez do dashboard):

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  # Admin
  - hostname: admin.jon.promo
    path: /api/.*
    service: http://snatcher-backend:8000
  
  - hostname: admin.jon.promo
    service: http://snatcher-frontend:80
  
  # Public
  - hostname: jon.promo
    path: /r/.*
    service: http://snatcher-public:8001
  
  - hostname: jon.promo
    service: http://snatcher-public:8001
  
  # Fallback
  - service: http_status:404
```

Deploy:
```bash
cloudflared tunnel route dns --overwrite-dns <TUNNEL_NAME> admin.jon.promo
cloudflared tunnel route dns --overwrite-dns <TUNNEL_NAME> jon.promo
cloudflared tunnel run <TUNNEL_NAME>
```

## Segurança

- ✅ `cmd/server` (admin) **não é exposível** em `jon.promo` — CF bloqueia por hostname
- ✅ `cmd/public` **read-only** em Postgres (use role dedicada)
- ⚠️ Verificar que `.env` NÃO exponha `ADMIN_*` em ambos os services
- ⚠️ Rate-limit em CF Zero Trust > Security > Rate Limiting para mitigar abuse

## Teste Local (sem CF)

```bash
# Terminal 1: Backend escutando em 8000 e 8001
cd /workspace/.cache/snatcher
make dev

# Terminal 2: Testar com Host header
curl -H "Host: admin.jon.promo" http://localhost:8000/api/health
curl -H "Host: jon.promo" http://localhost:8001/health

# Ou usar Docker Compose internamente (internal DNS)
docker-compose exec snatcher-backend curl http://snatcher-frontend:80
```

## Troubleshooting

| Sintoma | Causa | Fix |
|---------|-------|-----|
| 403 Forbidden em admin.jon.promo | Regra de rota errada / path não match | Revisar order no dashboard |
| 404 em jon.promo/r/* | Ingress rule `/r/.*` antes de default? | Mover regra para cima |
| Tunnel conecta mas sem resposta | Backend não listening em 8000/8001 | `make dev` + `make health` |
| Erro credenciais | `CLOUDFLARE_TOKEN` vencido ou inválido | Gerar novo em Zero Trust |

## Próximas etapas

- [ ] Auto-generate `config.yml` via `make setup` (integrar com .env)
- [ ] Add WAF rules em CF para proteger `/admin/*`
- [ ] Setup monitoring de tunnel uptime + alerts
