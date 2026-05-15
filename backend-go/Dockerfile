FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /app

# CGO off = binary estático. GOMAXPROCS=1 + low GOGC ajuda em build hosts com pouca RAM (Coolify sem BuildKit).
ENV CGO_ENABLED=0 GOMAXPROCS=1 GOGC=20

COPY go.mod go.sum ./
RUN go mod download
ARG CACHEBUST=20260512_1740
COPY . .

# Redireciona saída para ficheiro e faz cat no fail: sem BuildKit o painel do Coolify costuma omitir stderr do go build.
RUN sh -c 'go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o backendv2 ./cmd/server > /tmp/build-server.log 2>&1 || { echo "=== go build ./cmd/server ==="; cat /tmp/build-server.log; exit 1; }'
RUN sh -c 'go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o seed ./cmd/seed > /tmp/build-seed.log 2>&1 || { echo "=== go build ./cmd/seed ==="; cat /tmp/build-seed.log; exit 1; }'
RUN sh -c 'go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o public ./cmd/public > /tmp/build-public.log 2>&1 || { echo "=== go build ./cmd/public ==="; cat /tmp/build-public.log; exit 1; }'

FROM alpine:3.19 AS server
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /app/backendv2 .
COPY --from=builder /app/seed .
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=60s \
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
