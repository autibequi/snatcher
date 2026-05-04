# Setup Postgres — Snatcher

## Desenvolvimento local

### Pré-requisitos
- Docker ou Podman com compose

### Subir o banco

```bash
# Subir postgres do app (porta 5433 no host)
docker compose -f docker-compose.dev.yml up -d snatcher-postgres

# Verificar que está saudável
docker compose -f docker-compose.dev.yml ps snatcher-postgres
```

### Configurar variáveis

Copiar `.env.example` para `.env`:

```bash
cp .env.example .env
```

O `DATABASE_URL` default em `.env.example` aponta para o container:
```
DATABASE_URL=postgres://snatcher:devpass@snatcher-postgres:5432/snatcher?sslmode=disable
```

Para conexão direta do host (sem Docker):
```
DATABASE_URL=postgres://snatcher:devpass@localhost:5433/snatcher?sslmode=disable
```

### Rodar migrations

```bash
cd backend-go
make migrate
# ou: go run ./cmd/migrate
```

### Subir o servidor

```bash
make dev
```

## Testes de integração

Os testes usam um Postgres ephemero separado (porta 5433, database `snatcher_test`):

```bash
# Subir postgres de teste
docker compose -f backend-go/docker-compose.test.yml up -d

# Rodar testes
cd backend-go
make test
# ou: TEST_DATABASE_URL=postgres://snatcher:snatcher@localhost:5433/snatcher_test?sslmode=disable go test ./...
```

## Produção

Configurar `DATABASE_URL` apontando para o Postgres gerenciado (AWS RDS, Supabase, etc.).
