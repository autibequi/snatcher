BINARY = backendv2
CMD    = ./cmd/server

.PHONY: build run tidy migrate migrate-up migrate-down migrate-status migrate-create migrate-force migrate-goto test test-up test-down test-logs lint vet swag docs

build:
	go build -buildvcs=false -o $(BINARY) $(CMD)

run:
	go run -buildvcs=false $(CMD)

tidy:
	go mod tidy

# --- Test infra ---

# Sobe Postgres efêmero para integration tests (porta 5433).
test-up:
	docker compose -f docker-compose.test.yml up -d
	@echo "esperando postgres-test ficar pronto..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U snatcher -d snatcher_test >/dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "timeout aguardando postgres-test"; exit 1

test-down:
	docker compose -f docker-compose.test.yml down -v

test-logs:
	docker compose -f docker-compose.test.yml logs -f postgres-test

# Aplica migrations contra DATABASE_URL (ou default).
# DEPRECATED: use migrate-up instead
migrate:
	@echo "DEPRECATED: use migrate-up. Delegating..."
	@go run -buildvcs=false ./cmd/migrate up

migrate-up: ## Aplica todas as migrations pendentes
	@go run -buildvcs=false ./cmd/migrate up

migrate-down: ## Reverte a última migration
	@go run -buildvcs=false ./cmd/migrate down

migrate-status: ## Mostra a versão atual das migrations
	@go run -buildvcs=false ./cmd/migrate version

migrate-create: ## Cria nova migration: make migrate-create NAME=add_widget
	@[ -n "$(NAME)" ] || { echo "NAME is required: make migrate-create NAME=add_widget"; exit 1; }
	@TS=$$(date -u +%Y%m%d%H%M%S); \
	UPFILE=internal/db/migrations/$${TS}_$(NAME).up.sql; \
	DOWNFILE=internal/db/migrations/$${TS}_$(NAME).down.sql; \
	printf '-- Migration: $(NAME)\n\n' > $$UPFILE; \
	printf '-- Revert: $(NAME)\n\n' > $$DOWNFILE; \
	echo "Created $$UPFILE"; \
	echo "Created $$DOWNFILE"

migrate-force: ## Força estado de versão sem aplicar migrations: make migrate-force V=20260512000076
	@[ -n "$(V)" ] || { echo "V is required: make migrate-force V=20260512000076"; exit 1; }
	@go run -buildvcs=false ./cmd/migrate force $(V)

migrate-goto: ## Migra para versão específica: make migrate-goto V=20260512000050
	@[ -n "$(V)" ] || { echo "V is required: make migrate-goto V=20260512000050"; exit 1; }
	@go run -buildvcs=false ./cmd/migrate goto $(V)

# Roda testes assumindo Postgres já no ar (CI seta service container).
test:
	go test -buildvcs=false ./... -count=1

# Atalho local: sobe DB, roda testes, derruba ao fim.
test-local: test-up
	go test -buildvcs=false ./... -count=1 || (status=$$?; $(MAKE) test-down; exit $$status)
	$(MAKE) test-down

vet:
	go vet -buildvcs=false ./...

lint:
	@which golangci-lint >/dev/null 2>&1 || { echo "instale golangci-lint"; exit 1; }
	golangci-lint run ./...

# Regenera a spec OpenAPI a partir das annotations nos handlers.
# Requer: go install github.com/swaggo/swag/cmd/swag@latest
swag:
	swag init -g cmd/server/main.go -o internal/docs --parseDependency --parseInternal

docs: swag
