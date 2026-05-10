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
# Em falha: meminfo + segundo go build sem strip (às vezes o linker morre por RAM sem mensagem útil).
RUN set -eux; \
  build_bin() { \
    out="$1"; pkg="$2"; \
    if ! go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o "$out" "$pkg"; then \
      echo "=== snatcher build FAILED for ${out} (${pkg}) ==="; \
      echo "=== /proc/meminfo (top) ==="; head -n 20 /proc/meminfo || true; \
      echo "=== retry (no strip, stderr captured) ==="; \
      go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -v -o "/tmp/${out}-diag" "$pkg" 2>&1 || true; \
      exit 1; \
    fi; \
  }; \
  build_bin backendv2 ./cmd/server

RUN set -eux; \
  build_bin() { \
    out="$1"; pkg="$2"; \
    if ! go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o "$out" "$pkg"; then \
      echo "=== snatcher build FAILED for ${out} (${pkg}) ==="; \
      echo "=== /proc/meminfo (top) ==="; head -n 20 /proc/meminfo || true; \
      echo "=== retry (no strip) ==="; \
      go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -v -o "/tmp/${out}-diag" "$pkg" 2>&1 || true; \
      exit 1; \
    fi; \
  }; \
  build_bin seed ./cmd/seed

RUN set -eux; \
  build_bin() { \
    out="$1"; pkg="$2"; \
    if ! go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o "$out" "$pkg"; then \
      echo "=== snatcher build FAILED for ${out} (${pkg}) ==="; \
      echo "=== /proc/meminfo (top) ==="; head -n 20 /proc/meminfo || true; \
      echo "=== retry (no strip) ==="; \
      go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -v -o "/tmp/${out}-diag" "$pkg" 2>&1 || true; \
      exit 1; \
    fi; \
  }; \
  build_bin public ./cmd/public

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
