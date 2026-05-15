FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /app

# CGO off = binary estático. GOMAXPROCS=1 + low GOGC ajuda em build hosts com pouca RAM (Coolify sem BuildKit).
ENV CGO_ENABLED=0 GOMAXPROCS=1 GOGC=20

COPY go.mod go.sum ./
RUN go mod download
ARG CACHEBUST=20260512_1740
COPY . .

# -v: imprime pacotes compilados — essencial quando o log do deploy só mostra "exit code 1" sem o erro do go tool.
RUN go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o backendv2 ./cmd/server
RUN go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o seed ./cmd/seed
RUN go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -v -o public ./cmd/public

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
