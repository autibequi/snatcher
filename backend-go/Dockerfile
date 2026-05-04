FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o backendv2 ./cmd/server && \
    CGO_ENABLED=0 go build -o seed ./cmd/seed

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=builder /app/backendv2 .
COPY --from=builder /app/seed .
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=5s \
  CMD wget -qO- http://localhost:8000/api/health || exit 1
ENTRYPOINT ["./backendv2"]
