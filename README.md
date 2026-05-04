# Promo Snatcher

Varredor automático de preços (Mercado Livre + Amazon) com envio para grupos WhatsApp e Telegram.

## Início rápido

```bash
git clone git@github.com:usuario/promo-snatcher.git
cd promo-snatcher
make setup       # cria .env e gera segredos automáticos
nano .env        # preencher: AUTH_PASSWORD, EVOLUTION_API_KEY, PUBLIC_URL
make start       # sobe a stack
```

Acesso: `http://localhost:6060`

Com Cloudflare Tunnel (acesso externo):
```bash
# Adicionar CLOUDFLARE_TOKEN no .env
make start-tunnel
```

## Database

O backend Go usa **PostgreSQL 16**. Para dev local:

```bash
# 1. Subir postgres
docker compose -f docker-compose.dev.yml up -d snatcher-postgres

# 2. Configurar
cp .env.example .env

# 3. Rodar migrations
cd backend-go && make migrate

# 4. Subir servidor
make dev
```

Ver [docs/postgres-setup.md](docs/postgres-setup.md) para detalhes.

## Variáveis obrigatórias no .env

| Variável | Descrição |
|---|---|
| `AUTH_PASSWORD` | Senha do painel admin |
| `EVOLUTION_API_KEY` | Chave da API WhatsApp (escolha qualquer senha forte) |
| `PUBLIC_URL` | URL pública desta instância (usada nos links das mensagens) |
| `AUTH_SECRET` | Gerado automaticamente pelo `make setup` |

## Comandos

```
make setup          Cria .env e gera segredos automáticos
make start          Sobe a stack (sem Cloudflare Tunnel)
make start-tunnel   Sobe a stack + Cloudflare Tunnel
make down           Para todos os containers
make logs           Logs em tempo real
make status         Status dos containers + próximo scan
make scan           Dispara scan manual em todos os grupos
make shell          Shell no container do backend
```

---

## Raspberry Pi

### 1. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
newgrp docker
```

### 2. Configurar swap (evita OOM kills)

```bash
sudo dphys-swapfile swapoff
echo "CONF_SWAPSIZE=2048" | sudo tee /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 3. Subir a aplicação

```bash
git clone git@github.com:usuario/promo-snatcher.git
cd promo-snatcher
make setup
nano .env   # AUTH_PASSWORD, EVOLUTION_API_KEY, PUBLIC_URL (ex: http://ip-do-pi:6060)
make start
```

### Consumo de memória esperado

| Container | Limite |
|---|---|
| backend (Python + Chromium) | 768 MB |
| evolution (WhatsApp) | 512 MB |
| postgres | 256 MB |
| redis | 96 MB |
| frontend (nginx) | 64 MB |
| cloudflared | 64 MB |
| **Total** | ~1.85 GB |

Recomendado: Raspberry Pi 4 com 4 GB ou mais (64-bit OS).

### Reinicialização automática

Com `sudo systemctl enable docker` configurado, todos os containers sobem automaticamente quando o Pi reinicia — `restart: unless-stopped` está definido em todos os serviços.

---

## API

Documentação interativa: `http://localhost:8000/docs`
