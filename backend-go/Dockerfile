FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Um RUN por binário: no Coolify/Docker legacy o log mostra qual etapa falhou.
# -buildvcs=false: contexto de build costuma não ter .git completo → Go 1.18+ falha ao stampar VCS.
RUN CGO_ENABLED=0 go build -buildvcs=false -o backendv2 ./cmd/server
RUN CGO_ENABLED=0 go build -buildvcs=false -o seed ./cmd/seed
RUN CGO_ENABLED=0 go build -buildvcs=false -o public ./cmd/public

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
