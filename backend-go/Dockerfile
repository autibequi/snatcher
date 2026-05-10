FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /app

ENV CGO_ENABLED=0 GOMAXPROCS=1 GOGC=10

COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -o backendv2 ./cmd/server
RUN go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -o seed ./cmd/seed
RUN go build -tags=nosqlite -buildvcs=false -trimpath -p 1 -ldflags="-s -w" -o public ./cmd/public

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
