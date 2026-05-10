FROM golang:1.23-alpine AS builder
# git: dependências / replace que ainda tocam VCS; ca-certificates: fetch HTTPS de sum/mod
RUN apk add --no-cache git ca-certificates
WORKDIR /app

# Sem BuildKit / VPS pequeno: compilação Go paralela pode matar o processo (OOM → exit 1 sem stderr útil).
# Produção usa Postgres; -tags=nosqlite não compila modernc.org/sqlite (reduz muito RAM/tempo de build).
ENV CGO_ENABLED=0
ENV GOMAXPROCS=1
# Mais GC durante compile = menos pico de heap em VPS / Docker sem BuildKit (OOM → exit 1 sem mensagem).
ENV GOGC=10

COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN go version && go env GOVERSION GOPATH

# Um RUN por binário: no Coolify/Docker legacy o log mostra qual etapa falhou.
# -buildvcs=false: contexto de build costuma não ter .git completo → Go 1.18+ falha ao stampar VCS.
# -p 1: menos paralelismo de pacotes (com GOMAXPROCS=1 reduz pico de RAM em VPS pequenos).
# -v: imprime pacotes compilados — ajuda a ver onde parou se o build falhar.
#
# Build em um único /bin/sh -c (POSIX): evita quirks de funções + set -eux em ash/Docker antigo.
# Em falha: meminfo + segundo go build sem strip (stderr truncado para não estourar log).
RUN /bin/sh -c 'go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o backendv2 ./cmd/server \
  || { echo "=== snatcher build FAILED: backendv2 ./cmd/server ==="; head -n 25 /proc/meminfo || true; echo "=== retry (no strip, last 120 lines) ==="; go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -v -o /tmp/backendv2-diag ./cmd/server 2>&1 | tail -n 120; exit 1; }'

RUN /bin/sh -c 'go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o seed ./cmd/seed \
  || { echo "=== snatcher build FAILED: seed ./cmd/seed ==="; head -n 25 /proc/meminfo || true; echo "=== retry (no strip, last 120 lines) ==="; go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -v -o /tmp/seed-diag ./cmd/seed 2>&1 | tail -n 120; exit 1; }'

RUN /bin/sh -c 'go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o public ./cmd/public \
  || { echo "=== snatcher build FAILED: public ./cmd/public ==="; head -n 25 /proc/meminfo || true; echo "=== retry (no strip, last 120 lines) ==="; go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -v -o /tmp/public-diag ./cmd/public 2>&1 | tail -n 120; exit 1; }'

FROM alpine:3.19 AS server
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /app/backendv2 .
COPY --from=builder /app/seed .
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=5s \
  CMD wget -qO- http://localhost:8000/api/health || exit 1
ENTRYPOINT ["./backendv2"]

FROM alpine:3.19 AS public
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/public .
EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:8001/health || exit 1
ENTRYPOINT ["./public"]
