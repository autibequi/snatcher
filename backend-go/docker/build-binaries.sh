#!/bin/sh
# Build dos binários no estágio Docker (legacy engine / Coolify sem BuildKit / VPS com pouca RAM).
# - Swap opcional (swapon pode falhar em alguns daemons Docker → ignoramos silenciosamente).
# - Logs completos em /tmp em falha (Coolify às vezes trunca stderr inline).
set -eu

cd /app

setup_swap() {
  if dd if=/dev/zero of=/swapfile bs=1M count=512 2>/dev/null; then
    chmod 600 /swapfile || true
    if mkswap /swapfile 2>/dev/null && swapon /swapfile 2>/dev/null; then
      echo "=== swap file 512MiB enabled ==="
      return 0
    fi
  fi
  rm -f /swapfile 2>/dev/null || true
  echo "=== swap not available (continuing; may OOM on tiny hosts) ==="
}

cleanup_swap() {
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile 2>/dev/null || true
}

trap cleanup_swap EXIT INT TERM

go version
go env GOVERSION GOPATH GOMAXPROCS GOGC CGO_ENABLED

setup_swap

build_one() {
  out="$1"
  pkg="$2"
  log="/tmp/go-build-${out}.log"
  echo "=== go build -> ${out} (${pkg}) ==="
  if go build \
    -tags=nosqlite \
    -buildvcs=false \
    -trimpath \
    -p 1 \
    -ldflags="-s -w" \
    -v \
    -o "$out" \
    "$pkg" >"$log" 2>&1
  then
    echo "=== OK ${out} ==="
    return 0
  fi

  echo "=== snatcher build FAILED: ${out} (${pkg}) ==="
  echo "=== /proc/meminfo (top) ==="
  head -n 25 /proc/meminfo || true
  echo "=== go build log (${out}, last 200 lines) ==="
  tail -n 200 "$log" || true
  echo "=== retry without strip (last 120 lines) ==="
  go build \
    -tags=nosqlite \
    -buildvcs=false \
    -trimpath \
    -p 1 \
    -v \
    -o "/tmp/${out}-diag" \
    "$pkg" >"/tmp/go-retry-${out}.log" 2>&1 || true
  tail -n 120 "/tmp/go-retry-${out}.log" || true
  exit 1
}

build_one backendv2 ./cmd/server
build_one seed ./cmd/seed
build_one public ./cmd/public

echo "=== all Go binaries built OK ==="
