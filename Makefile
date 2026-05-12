# Promo Snatcher — Makefile
# Detecta docker compose v2 ou podman-compose
COMPOSE := $(shell \
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
    echo "docker compose"; \
  elif command -v podman-compose >/dev/null 2>&1; then \
    echo "podman-compose"; \
  else \
    echo "docker-compose"; \
  fi)
BACKEND_URL ?= http://localhost:8000
FRONTEND_URL ?= http://localhost:6060

.DEFAULT_GOAL := help

.PHONY: help setup start start-tunnel deploy deploy-tunnel update pi-setup snatcher snatcher-down snatcher-logs beta up down dev dev-down dev-logs logs logs-backend logs-frontend \
        shell ps clean test health smoke scan status fix-network build-base \
        backend-test-up backend-test backend-test-down backend-build backend-vet admin \
        migrate-up migrate-down migrate-status migrate-create migrate-force migrate-goto

help: ## Mostra este help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}{printf "\033[36m%-18s\033[0m %s\n",$$1,$$2}'

# ---------------------------------------------------------------------------
# Backend Go — testes integrados (delegam ao backend-go/Makefile)
# ---------------------------------------------------------------------------

backend-test-up: ## Sobe Postgres efêmero p/ testes do backend-go
	$(MAKE) -C backend-go test-up

backend-test: ## Roda go test ./... no backend-go (assume Postgres up)
	GOTOOLCHAIN=local $(MAKE) -C backend-go test

backend-test-down: ## Derruba Postgres de testes do backend-go
	$(MAKE) -C backend-go test-down

backend-build: ## go build no backend-go
	GOTOOLCHAIN=local $(MAKE) -C backend-go build

backend-vet: ## go vet no backend-go
	GOTOOLCHAIN=local $(MAKE) -C backend-go vet

# ---------------------------------------------------------------------------
# Migrations (golang-migrate) — delegam ao backend-go/Makefile
# ---------------------------------------------------------------------------

migrate-up: ## Aplica todas as migrations pendentes (DATABASE_URL obrigatório)
	GOTOOLCHAIN=local $(MAKE) -C backend-go migrate-up

migrate-down: ## Reverte a última migration (DATABASE_URL obrigatório)
	GOTOOLCHAIN=local $(MAKE) -C backend-go migrate-down

migrate-status: ## Mostra a versão atual das migrations
	GOTOOLCHAIN=local $(MAKE) -C backend-go migrate-status

migrate-create: ## Cria nova migration: make migrate-create NAME=add_widget
	GOTOOLCHAIN=local $(MAKE) -C backend-go migrate-create NAME=$(NAME)

migrate-force: ## Força estado de versão: make migrate-force V=20260512000076
	GOTOOLCHAIN=local $(MAKE) -C backend-go migrate-force V=$(V)

migrate-goto: ## Migra para versão específica: make migrate-goto V=20260512000050
	GOTOOLCHAIN=local $(MAKE) -C backend-go migrate-goto V=$(V)

# ---------------------------------------------------------------------------
# Stack
# ---------------------------------------------------------------------------

setup: ## Primeira execução: cria .env e gera segredos automáticos
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ .env criado a partir do .env.example"; \
	else \
		echo ".env já existe — pulando cópia"; \
	fi
	@python3 -c "\
import re, secrets, pathlib; \
p = pathlib.Path('.env'); \
env = p.read_text(); \
changed = False; \
lines = []; \
for line in env.splitlines(): \
    if line.startswith('AUTH_SECRET=') and not line.split('=',1)[1].strip(): \
        line = 'AUTH_SECRET=' + secrets.token_hex(32); changed = True; \
    lines.append(line); \
p.write_text('\n'.join(lines) + '\n') if changed else None; \
print('✓ AUTH_SECRET gerado automaticamente') if changed else None"
	@echo ""
	@echo "Próximos passos:"
	@echo "  1. Edite .env e defina: AUTH_PASSWORD, EVOLUTION_API_KEY"
	@echo "  2. Opcional (acesso externo): CLOUDFLARE_TOKEN"
	@echo "  3. make start"

start: ## PC: builda local + sobe tudo
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend-go/data
	$(COMPOSE) up --build --remove-orphans -d
	@echo ""
	@echo "Stack no ar: http://$$(hostname -I | awk '{print $$1}'):$${FRONTEND_PORT:-6060}"
	@echo "Logs: make logs  |  Status: make status"

start-tunnel: ## PC: builda local + Cloudflare Tunnel
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend-go/data
	$(COMPOSE) --profile tunnel up --build --remove-orphans -d
	@echo ""
	@echo "Stack + Tunnel no ar. Logs: make logs"

deploy: ## Pi: pull imagens do ghcr.io + sobe tudo (sem buildar)
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend-go/data
	$(COMPOSE) pull
	$(COMPOSE) up --remove-orphans -d
	@echo ""
	@echo "Stack no ar: http://$$(hostname -I | awk '{print $$1}'):$${FRONTEND_PORT:-6060}"

deploy-tunnel: ## Pi: pull + Cloudflare Tunnel (sem buildar)
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend-go/data
	$(COMPOSE) --profile tunnel pull
	$(COMPOSE) --profile tunnel up --remove-orphans -d
	@echo ""
	@echo "Stack + Tunnel no ar."

update: ## Pi: pull novas imagens + restart (Watchtower faz automaticamente)
	git pull
	$(COMPOSE) pull backend frontend redirect
	$(COMPOSE) up -d --remove-orphans
	@echo ""
	@echo "Atualizado."

pi-setup: ## Raspberry Pi: instala Docker, habilita no boot e configura swap 2GB
	@echo "=== Instalando Docker ==="
	curl -fsSL https://get.docker.com | sh
	sudo usermod -aG docker $$USER
	sudo systemctl enable docker
	@echo ""
	@echo "=== Configurando swap 2GB ==="
	sudo dphys-swapfile swapoff
	@echo "CONF_SWAPSIZE=2048" | sudo tee /etc/dphys-swapfile
	sudo dphys-swapfile setup
	sudo dphys-swapfile swapon
	@echo ""
	@echo "Docker instalado e swap configurado."
	@echo "Feche e abra o terminal (ou rode 'newgrp docker') e então: make setup"


snatcher: ## Build LOCAL + Cloudflare Tunnel (usa código do repo, não ghcr)
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend-go/data
	$(COMPOSE) --profile tunnel \
		-f docker-compose.yml \
		-f docker-compose.snatcher.yml \
		up --build --remove-orphans -d
	@echo ""
	@echo "Snatcher (build local) + Tunnel no ar. Logs: make snatcher-logs"

snatcher-down: ## Para o snatcher (build local)
	$(COMPOSE) --profile tunnel \
		-f docker-compose.yml \
		-f docker-compose.snatcher.yml \
		down --remove-orphans

snatcher-logs: ## Logs do snatcher (build local)
	$(COMPOSE) -f docker-compose.yml -f docker-compose.snatcher.yml logs -f

beta: ## Build local + Cloudflare Tunnel → beta.autibequi.com
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend-go/data
	BUILDAH_FORMAT=docker $(COMPOSE) --profile tunnel \
		-f docker-compose.yml \
		-f docker-compose.snatcher.yml \
		up --build --force-recreate --remove-orphans -d
	@echo ""
	@echo "Beta (build local) + Tunnel no ar. Logs: make logs"

up: ## Sobe a stack em background (sem rebuild)
	@mkdir -p backend-go/data
	$(COMPOSE) up --remove-orphans -d

down: ## Para e remove os containers
	$(COMPOSE) down

ps: ## Status dos containers
	$(COMPOSE) ps

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

logs: ## Logs de todos os serviços (follow)
	$(COMPOSE) logs -f

logs-backend: ## Logs só do backend
	$(COMPOSE) logs -f backend

logs-frontend: ## Logs só do frontend
	$(COMPOSE) logs -f frontend

# ---------------------------------------------------------------------------
# Dev
# ---------------------------------------------------------------------------

dev: ## Modo dev com hot-reload (backend uvicorn --reload + frontend vite dev)
	@mkdir -p backend-go/data
	$(COMPOSE) -f docker-compose.dev.yml up --build --remove-orphans -d
	@echo ""
	@echo "🔥 Dev mode — hot-reload (rede Docker interna: promosnatcher_internal)"
	@echo "   UI (host):     http://localhost:6060  → Vite proxy /api → promo-snatcher-backend:8000"
	@echo "   API (host):    http://localhost:8000"
	@echo "   Evolution:     http://localhost:3200  (API interna: http://promo-snatcher-evolution:8080)"
	@echo "   Tunnel (opt):  COMPOSE_PROFILES=tunnel + CLOUDFLARE_TOKEN no .env"
	@echo "   Logs:          make dev-logs"

dev-down: ## Para o ambiente dev
	$(COMPOSE) -f docker-compose.dev.yml down

dev-logs: ## Logs do ambiente dev (follow)
	$(COMPOSE) -f docker-compose.dev.yml logs -f

admin: ## Cria ou atualiza usuario admin (pergunta email e senha)
	@read -p "Email do admin: " EMAIL; \
	read -s -p "Senha: " PASS; echo; \
	$(COMPOSE) exec backend sh -c \
	  "DATABASE_URL=\"$$DATABASE_URL\" SEED_ADMIN_EMAIL=\"$$EMAIL\" SEED_ADMIN_PASSWORD=\"$$PASS\" ./seed"

shell: ## Abre shell no container do backend
	$(COMPOSE) exec backend bash

shell-frontend: ## Abre shell no container do frontend
	$(COMPOSE) exec frontend sh

# ---------------------------------------------------------------------------
# Testes e saúde
# ---------------------------------------------------------------------------

test: ## Roda test suite do backend (sobe Postgres efêmero, executa go test, derruba)
	$(MAKE) -C backend-go test-up
	GOTOOLCHAIN=local $(MAKE) -C backend-go test || { st=$$?; $(MAKE) -C backend-go test-down; exit $$st; }
	$(MAKE) -C backend-go test-down

health: ## Smoke HTTP da stack rodando (default: localhost:8000; override: BACKEND_URL=https://...)
	@echo "Verificando $(BACKEND_URL) ..."
	@curl -sf $(BACKEND_URL)/api/health > /tmp/snhealth.json 2>/dev/null || { \
	  echo "ERRO: backend nao responde em $(BACKEND_URL)."; \
	  echo "  → subir stack: make beta"; \
	  echo "  → ou apontar pra prod: BACKEND_URL=https://beta.autibequi.com make health"; \
	  exit 1; }
	@cat /tmp/snhealth.json | python3 -m json.tool
	@echo ""
	@echo "Endpoints publicos..."
	@curl -sf $(BACKEND_URL)/api/public/channels | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  canais publicos: {len(d) if d else 0}')"
	@echo ""
	@echo "OpenAPI / Swagger UI..."
	@curl -sf $(BACKEND_URL)/api/swagger/doc.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  swagger={d[\"swagger\"]} title={d[\"info\"][\"title\"]} version={d[\"info\"][\"version\"]}')"
	@echo ""
	@echo "Validator + rate-limit (Fase 0)..."
	@curl -sf -o /dev/null -w "  /api/auth/login {} → status %{http_code} (esperado 400)\n" -X POST $(BACKEND_URL)/api/auth/login -H 'Content-Type: application/json' -d '{}'
	@echo ""
	@echo "Prometheus..."
	@curl -sf $(BACKEND_URL)/metrics | grep -c '^http_\|^snatcher_' | xargs -I{} echo "  series Prometheus: {}"
	@echo ""
	@echo "Stack OK — frontend: $(FRONTEND_URL)  swagger: $(BACKEND_URL)/api/swagger  metrics: $(BACKEND_URL)/metrics"

smoke: health ## Alias para 'health'

status: ## Status resumido da stack + próximo scan
	@$(COMPOSE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || $(COMPOSE) ps
	@echo ""
	@curl -sf $(BACKEND_URL)/api/scan/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Scheduler: running={d[\"running\"]}  next_run={str(d.get(\"next_run\",\"?\"))[:19]}  interval={d.get(\"interval_minutes\",\"?\")}min')" 2>/dev/null || echo "Backend offline"

doctor: ## Coleta diagnóstico completo da stack (colar output no chat pra debug)
	@echo "========== PROMO SNATCHER DOCTOR =========="
	@echo ""
	@echo "--- [host] ---"
	@uname -a 2>/dev/null || echo "uname: n/a"
	@echo "arch: $$(uname -m)"
	@echo "docker: $$(docker --version 2>/dev/null || echo 'not found')"
	@echo "compose: $$($(COMPOSE) version 2>/dev/null || echo 'not found')"
	@echo ""
	@echo "--- [resources] ---"
	@free -h 2>/dev/null | head -2 || echo "free: n/a"
	@echo "swap: $$(swapon --show --noheadings 2>/dev/null | awk '{print $$3}' || echo 'n/a')"
	@df -h / 2>/dev/null | tail -1 | awk '{print "disk: " $$3 " used / " $$2 " total (" $$5 " full)"}'
	@echo ""
	@echo "--- [containers] ---"
	@$(COMPOSE) ps -a 2>/dev/null || echo "compose ps failed"
	@echo ""
	@echo "--- [images] ---"
	@docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}' 2>/dev/null | grep -i promo || echo "no promo images"
	@echo ""
	@echo "--- [health] ---"
	@curl -sf -m5 http://localhost:8000/api/health 2>/dev/null && echo "" || echo "backend: UNREACHABLE"
	@curl -sf -m5 http://localhost:6060/ >/dev/null 2>&1 && echo "frontend: OK" || echo "frontend: UNREACHABLE"
	@curl -sf -m5 http://localhost:6060/api/health >/dev/null 2>&1 && echo "nginx->backend proxy: OK" || echo "nginx->backend proxy: FAIL"
	@curl -sf -m5 http://localhost:3200/ >/dev/null 2>&1 && echo "evolution: OK" || echo "evolution: UNREACHABLE"
	@echo ""
	@echo "--- [logs backend (last 30)] ---"
	@$(COMPOSE) logs --tail=30 backend 2>/dev/null || echo "no backend logs"
	@echo ""
	@echo "--- [logs frontend (last 15)] ---"
	@$(COMPOSE) logs --tail=15 frontend 2>/dev/null || echo "no frontend logs"
	@echo ""
	@echo "--- [logs cloudflared (last 15)] ---"
	@$(COMPOSE) logs --tail=15 cloudflared 2>/dev/null || echo "no cloudflared logs"
	@echo ""
	@echo "--- [logs evolution (last 10)] ---"
	@$(COMPOSE) logs --tail=10 evolution 2>/dev/null || echo "no evolution logs"
	@echo ""
	@echo "--- [network] ---"
	@docker network inspect promo-snatcher_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}' 2>/dev/null \
		|| docker network inspect promo-snatcher --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}' 2>/dev/null \
		|| echo "network inspect failed"
	@echo ""
	@echo "--- [env check] ---"
	@[ -f .env ] && echo ".env: exists" || echo ".env: MISSING"
	@grep -q 'AUTH_PASSWORD=.' .env 2>/dev/null && echo "AUTH_PASSWORD: set" || echo "AUTH_PASSWORD: EMPTY"
	@grep -q 'AUTH_SECRET=.' .env 2>/dev/null && echo "AUTH_SECRET: set" || echo "AUTH_SECRET: EMPTY"
	@grep -q 'EVOLUTION_API_KEY=.' .env 2>/dev/null && echo "EVOLUTION_API_KEY: set" || echo "EVOLUTION_API_KEY: EMPTY"
	@grep -q 'CLOUDFLARE_TOKEN=.' .env 2>/dev/null && echo "CLOUDFLARE_TOKEN: set" || echo "CLOUDFLARE_TOKEN: EMPTY"
	@grep -q 'PUBLIC_URL=.' .env 2>/dev/null && echo "PUBLIC_URL: $$(grep 'PUBLIC_URL=' .env | cut -d= -f2)" || echo "PUBLIC_URL: EMPTY"
	@echo ""
	@echo "--- [restart counts] ---"
	@docker inspect --format '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' $$(docker ps -aq --filter name=promo-snatcher) 2>/dev/null || echo "n/a"
	@echo ""
	@echo "========== END DOCTOR =========="

scan: ## Dispara scan manual em todos os grupos ativos
	@echo "Disparando scans..."
	@curl -sf $(BACKEND_URL)/api/groups | python3 -c "\
import sys, json, urllib.request; \
groups = json.load(sys.stdin); \
active = [g for g in groups if g['active']]; \
print(f'  {len(active)} grupos ativos'); \
[urllib.request.urlopen(urllib.request.Request(f'$(BACKEND_URL)/api/groups/{g[\"id\"]}/scan', method='POST')) for g in active]; \
print('  scans disparados')"

# ---------------------------------------------------------------------------
# Limpeza
# ---------------------------------------------------------------------------

clean: ## Remove containers, imagens e volume de dados (DESTRUTIVO)
	@echo "AVISO: isso remove containers, imagens e o volume promo-snatcher-data"
	@read -p "Confirma? [y/N] " ans && [ "$$ans" = "y" ] || exit 1
	$(COMPOSE) down --volumes --remove-orphans
	$(COMPOSE) down --rmi local 2>/dev/null || true
	@echo "Limpo."

clean-containers: ## Remove só os containers (mantém imagens e dados)
	$(COMPOSE) down --remove-orphans

fix-network: ## Reaplica aliases DNS da rede Podman (rodar se 502 aparecer)
	@python3 -c "\
import docker, time; \
c = docker.DockerClient(base_url='unix:///run/user/host/podman/podman.sock'); \
net = c.networks.get('promo-snatcher'); \
aliases = {'promo-snatcher-backend':'backend','promo-snatcher-evolution':'evolution','promo-snatcher-postgres':'postgres','promo-snatcher-redis':'redis'}; \
[([net.disconnect(c.containers.get(n), force=True) if True else None, net.connect(c.containers.get(n), aliases=[a])] if c.containers.get(n) else None) for n,a in aliases.items() if c.containers.get(n) is not None]; \
fe = c.containers.get('promo-snatcher-frontend'); \
[net.disconnect(fe, force=True), net.connect(fe), fe.exec_run('nginx -s reload')]; \
print('Aliases reconfigurados')"; \
	@echo "Testando..."
	@curl -sf $(BACKEND_URL)/api/health > /dev/null && echo "Backend: OK" || echo "Backend: OFFLINE"
	@curl -sf http://localhost:6060/api/health > /dev/null && echo "Nginx proxy: OK" || echo "Nginx proxy: FAIL"
