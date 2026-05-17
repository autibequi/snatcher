#!/usr/bin/env bash
# Aplica workflows na raiz do repo (fora do plug, onde .github é gravável).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WF="${ROOT}/.github/workflows"
SRC="${ROOT}/coolify/workflows-root"
mkdir -p "$WF"
cp "$SRC/ci.yml" "$WF/ci.yml"
cp "$SRC/deploy.yml" "$WF/deploy.yml"
rm -f "$WF/build-base.yml" "$WF/build-images.yml" 2>/dev/null || true
rm -f "${ROOT}/backend-go/.github/workflows/ci.yml" "${ROOT}/backend-go/.github/workflows/deploy.yml" 2>/dev/null || true
echo "OK — workflows em $WF"
echo "Próximo: cd $ROOT && git add .github coolify && git commit && git push"
