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

# Script único: logs para /tmp em falha (Coolify trunca menos), swap opcional contra OOM em VPS.
# Ver docker/build-binaries.sh
RUN chmod +x docker/build-binaries.sh && ./docker/build-binaries.sh

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
