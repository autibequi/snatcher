#!/usr/bin/env bash
set -euo pipefail

# Captura snapshot de baseline e loga snapshot_id em docs/baseline-captures.log
# Uso: rodar diariamente (cron) durante 7 dias antes de avançar pra Wave 0.

BASE_URL="${SNATCHER_API_URL:-http://localhost:8080}"
LOG_FILE="${BASELINE_LOG:-/workspace/.cache/snatcher/docs/baseline-captures.log}"
TOKEN="${SNATCHER_ADMIN_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
    echo "ERRO: SNATCHER_ADMIN_TOKEN não setado" >&2
    exit 1
fi

# Criar pasta de snapshots se não existir
mkdir -p /workspace/.cache/snatcher/docs/baseline-snapshots

response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/api/admin/baseline/capture" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"scope":"global"}')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

if [[ "$http_code" != "201" ]]; then
    echo "$(date -Iseconds) ERRO http=$http_code body=$body" >> "$LOG_FILE"
    exit 1
fi

snapshot_id=$(echo "$body" | jq -r '.snapshot_id')
echo "$(date -Iseconds) OK snapshot_id=$snapshot_id" >> "$LOG_FILE"
echo "$body" > "/workspace/.cache/snatcher/docs/baseline-snapshots/$(date +%Y-%m-%d).json"
