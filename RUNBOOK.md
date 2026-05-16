# RUNBOOK — Snatcher

> Documento de referência operacional. Atualizado em: 2026-05-12. Autor: equipe snatcher.
> Revisão obrigatória a cada 90 dias ou após qualquer incidente de produção.

---

## Visão geral operacional

O Snatcher é um sistema de curadoria e envio de ofertas via WhatsApp composto por:

| Componente | Porta | Função |
|---|---|---|
| `cmd/server` | 8000 | Admin API + painel CRUD |
| `cmd/public` | 8001 | Shortlinks `/r/:short_id` + endpoints públicos |
| Evolution API | 8080 | Gateway WhatsApp (multi-instância) |
| Postgres 16 (app) | 5432 | Banco principal |
| Postgres 15 (evo) | 5433 | Banco da Evolution API |
| Frontend | 6060 | Dashboard React + Vite |

Stack de produção: Mac mini orquestrado via Coolify. Imagens publicadas em `ghcr.io/autibequi/snatcher-backend:latest`.

---

## Endpoints de health

| Serviço | Endpoint | Resposta esperada |
|---|---|---|
| Backend (server) | `GET http://localhost:8000/api/health` | `{"status":"ok"}` ou `200 OK` |
| Backend (public) | `GET http://localhost:8001/health` | `{"status":"ok"}` ou `200 OK` |
| Evolution API | `GET http://localhost:8080/` | resposta JSON da Evolution |

Para verificar todos de uma vez:

```bash
curl -sf http://localhost:8000/api/health && echo "server OK"
curl -sf http://localhost:8001/health       && echo "public OK"
curl -sf http://localhost:8080/             && echo "evolution OK"
```

---

## Logs: paths e níveis padrão

Todos os componentes Go usam `slog` com saída JSON para stdout/stderr. Em produção, o Docker/Coolify captura os logs via driver padrão.

```bash
# Ver logs do backend em tempo real (Coolify/Docker)
docker logs -f snatcher-backend 2>&1

# Filtrar apenas erros
docker logs snatcher-backend 2>&1 | grep '"level":"ERROR"'

# Ver últimas 100 linhas
docker logs --tail=100 snatcher-backend 2>&1
```

Níveis padrão:
- `DEBUG` — desabilitado em produção; habilitado via env `LOG_LEVEL=debug`
- `INFO` — eventos normais (item crawlado, mensagem enviada, job concluído)
- `WARN` — condição degradada mas não fatal (retry, fallback LLM)
- `ERROR` — falha que requer atenção (ban detectado, DB unreachable, job max_attempts atingido)

Para habilitar debug temporariamente sem redeploy:
```bash
# Editar appconfig ou ajustar tunable_parameter (quando disponível)
# Por enquanto: redeploy com LOG_LEVEL=debug no env
```

---

## Backup

### Comando canônico

```bash
pg_dump -F c "$DATABASE_URL" -f "backups/snatcher-$(date +%Y%m%d-%H%M%S).dump"
```

Onde `$DATABASE_URL` segue o formato: `postgresql://user:password@host:5432/dbname`

### Script de backup (`scripts/backup.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/snatcher/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTFILE="${BACKUP_DIR}/snatcher-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Iniciando pg_dump: ${OUTFILE}"
pg_dump -F c "${DATABASE_URL}" -f "${OUTFILE}"
echo "[backup] Concluído: ${OUTFILE} ($(du -sh "${OUTFILE}" | cut -f1))"

# Retention: apagar backups mais antigos que RETENTION_DAYS dias
find "${BACKUP_DIR}" -name "snatcher-*.dump" -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] Limpeza: removidos dumps com mais de ${RETENTION_DAYS} dias"
```

Tornar executável: `chmod +x /opt/snatcher/scripts/backup.sh`

### Cron diário (3h da manhã)

```cron
0 3 * * * DATABASE_URL="postgresql://user:password@localhost:5432/snatcher" /opt/snatcher/scripts/backup.sh >> /var/log/snatcher-backup.log 2>&1
```

Adicionar via `crontab -e` no usuário que tem acesso ao `pg_dump`.

**Retenção:** 30 dias. Backups mais antigos são removidos automaticamente pelo script.

**Verificação do cron:**

```bash
# Checar último run
tail -20 /var/log/snatcher-backup.log

# Listar backups existentes
ls -lh /opt/snatcher/backups/
```

---

## Restore step-by-step

### Pré-requisitos

- `pg_restore` instalado (mesmo major version do Postgres do backup)
- Acesso ao banco de destino (local ou staging)
- Arquivo `.dump` disponível

### Procedure (testada em DB isolado)

```bash
# 1. Criar banco isolado para restore
createdb snatcher_restore_test

# 2. Restaurar o dump
pg_restore \
  --no-owner \
  --no-privileges \
  -d snatcher_restore_test \
  /opt/snatcher/backups/snatcher-YYYYMMDD-HHMMSS.dump

# 3. Smoke query — verificar integridade básica
psql snatcher_restore_test -c "
SELECT
  (SELECT COUNT(*) FROM catalog)         AS catalog_rows,
  (SELECT COUNT(*) FROM groups)          AS groups_rows,
  (SELECT COUNT(*) FROM send_log)        AS send_log_rows,
  (SELECT COUNT(*) FROM price_history)   AS price_history_rows;
"

# 4. Verificar que tabelas principais existem
psql snatcher_restore_test -c "\dt"

# 5. Se smoke OK: destruir o DB de teste
dropdb snatcher_restore_test
```

### Restore em produção (emergência)

```bash
# ATENÇÃO: derruba o banco atual — só fazer após confirmar backup recente

# 1. Parar todos os serviços que escrevem no banco
docker stop snatcher-backend snatcher-public

# 2. Dropar e recriar o banco
psql -c "DROP DATABASE snatcher;"
psql -c "CREATE DATABASE snatcher OWNER snatcher_user;"

# 3. Restaurar
pg_restore \
  --no-owner \
  --no-privileges \
  -d snatcher \
  /opt/snatcher/backups/snatcher-YYYYMMDD-HHMMSS.dump

# 4. Smoke query (ver acima)

# 5. Subir serviços
docker start snatcher-backend snatcher-public

# 6. Verificar health endpoints
curl -sf http://localhost:8000/api/health
curl -sf http://localhost:8001/health
```

---

## Procedure de migration

### Aplicar migration nova

O projeto usa formato `-- migrate:up` / `-- migrate:down` (dbmate-like). Migrations ficam em `backend-go/db/migrations/`.

```bash
# 1. FAZER BACKUP antes de qualquer migration em produção
pg_dump -F c "$DATABASE_URL" -f "backups/pre-migration-$(date +%Y%m%d-%H%M%S).dump"

# 2. Verificar migration pendente
ls backend-go/db/migrations/ | tail -5

# 3. Aplicar (via cmd/migrate)
cd backend-go
go run ./cmd/migrate up

# 4. Verificar que aplicou
psql "$DATABASE_URL" -c "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;"

# 5. Smoke: checar tabelas/colunas novas
psql "$DATABASE_URL" -c "\d nome_da_tabela_nova"
```

**Gates obrigatórios antes de aplicar migration em produção:**
- [ ] Backup feito (verify: `ls -lh backups/ | tail -3`)
- [ ] Migration testada em ambiente local/dev com dados reais (clone do prod)
- [ ] Migration tem `-- migrate:down` funcional
- [ ] `go build ./...` passa sem erros (migration não quebra os tipos Go)
- [ ] Tempo estimado de lock: migrations com `ADD COLUMN` são seguras; `REWRITE` em tabelas > 100k rows = janela de manutenção

### Reverter migration

```bash
# Reverter a última migration aplicada
go run ./cmd/migrate down

# Verificar estado
psql "$DATABASE_URL" -c "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 3;"
```

Se a migration não tiver `-- migrate:down`, rollback deve ser feito via restore do backup pré-migration.

---

## Procedure de pause de modem / disable de loop LLM / rollback de tunable_parameter

### Pausar um modem

```sql
-- Pausa imediata
UPDATE modems
SET status = 'paused',
    paused_until = now() + INTERVAL '24 hours',
    paused_reason = 'manual pause — suspeita de ban'
WHERE slug = 'modem-01';

-- Verificar
SELECT slug, status, paused_until, paused_reason FROM modems;

-- Reativar
UPDATE modems SET status = 'active', paused_until = NULL, paused_reason = NULL
WHERE slug = 'modem-01';
```

### Desativar loop LLM

```sql
-- Desativar loop específico (entra em modo suggesting apenas)
UPDATE llm_autonomy SET status = 'suggesting' WHERE loop_name = 'affinity_adjust';

-- Desativar completamente
UPDATE llm_autonomy SET status = 'disabled' WHERE loop_name = 'affinity_adjust';

-- Ver status de todos os loops
SELECT loop_name, status, strikes_30d, last_strike_at FROM llm_autonomy ORDER BY loop_name;

-- Reativar
UPDATE llm_autonomy SET status = 'active', strikes_30d = 0 WHERE loop_name = 'affinity_adjust';
```

### Rollback de tunable_parameter

```sql
-- Ver parâmetro atual vs default
SELECT param_name, scope_type, current_value, default_value, last_changed, last_change_by
FROM tunable_parameters
WHERE param_name = 'cooldown_seconds';

-- Reverter para default
UPDATE tunable_parameters
SET current_value = default_value, last_changed = now(), last_change_by = 'manual_rollback'
WHERE param_name = 'cooldown_seconds' AND scope_type = 'global';

-- Rollback de todos os parâmetros para default (emergência)
UPDATE tunable_parameters
SET current_value = default_value, last_changed = now(), last_change_by = 'emergency_rollback';
```

---

## Procedure de emergência — Kill switch de todos os senders

Se houver suspeita de ban em massa, comportamento anômalo dos senders ou qualquer situação crítica, o procedimento de kill switch é:

### 1. Parar todos os senders imediatamente

```bash
# Opção A: via Docker (produção)
docker stop snatcher-backend

# Opção B: se rodando localmente
pkill -f "snatcher" || true
```

### 2. Confirmar que envios pararam

```bash
# Checar que não há dispatch_worker ativo
docker ps | grep snatcher

# Checar que send_queue não está sendo drenada
psql "$DATABASE_URL" -c "
SELECT status, COUNT(*) FROM send_queue GROUP BY status;
"
```

### 3. Registrar pausa sistêmica

```sql
INSERT INTO system_pauses (triggered_by, reasoning, signals_snapshot, paused_at)
VALUES (
    'manual',
    'kill switch ativado manualmente — suspeita de ban em massa',
    '{"action": "docker stop snatcher-backend", "triggered_by": "operator"}',
    now()
);
```

### 4. Fazer backup imediato

```bash
pg_dump -F c "$DATABASE_URL" -f "backups/emergency-$(date +%Y%m%d-%H%M%S).dump"
```

### 5. Investigar

```sql
-- Checar ban_events recentes
SELECT account_id, modem_id, reason, detected_at FROM ban_events ORDER BY detected_at DESC LIMIT 20;

-- Checar consecutive_failures nas contas
SELECT phone, status, consecutive_failures, last_sent_at FROM accounts ORDER BY consecutive_failures DESC;

-- Checar send_log de erros
SELECT error_code, COUNT(*) FROM send_log WHERE status = 'failed' AND sent_at > now() - INTERVAL '1 hour' GROUP BY error_code;
```

### 6. Restore do último backup (se necessário)

Seguir procedure de restore em produção (seção acima).

### 7. Reiniciar com cautela

```bash
# Após diagnóstico e correção
docker start snatcher-backend

# Monitorar logs por pelo menos 10 minutos
docker logs -f snatcher-backend 2>&1 | grep -E '(ERROR|WARN|ban|failed)'
```

### 8. Fechar pausa sistêmica

```sql
UPDATE system_pauses SET resumed_at = now(), was_false_positive = false
WHERE resumed_at IS NULL ORDER BY paused_at DESC LIMIT 1;
```

---

## Fase 8 — Cache de imagens (volume obrigatório)

O job `cache_images` (Fase 8) baixa `image_url` de produtos do catálogo para filesystem local. Requer volume persistente montado.

### Configuração do volume (docker-compose)

```yaml
services:
  snatcher-backend:
    volumes:
      - snatcher_images:/var/lib/snatcher/images  # volume obrigatório para Fase 8

volumes:
  snatcher_images:
    driver: local
```

### Variável de ambiente alternativa

```env
CACHE_IMAGES_DIR=/var/lib/snatcher/images   # default — pode sobrescrever para outro path
```

### Verificar imagens cacheadas

```bash
# Quantas imagens estão no cache
ls /var/lib/snatcher/images/**/*.bin 2>/dev/null | wc -l

# Status via API
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/diferenciais/status
```

### Limpar cache de imagens

```bash
# Remove tudo e força re-download na próxima execução do job
rm -rf /var/lib/snatcher/images/*
psql "$DATABASE_URL" -c "UPDATE catalog SET cached_image_path = NULL, cached_image_at = NULL"
```

**Custo estimado de armazenamento**: ~5-20 MB por 1000 imagens (thumbnails). 10k produtos = ~50-200 MB. Filesystem local = sem custo adicional. Backblaze B2 = R$ 5-20/mês se externalizar.

---

## Baseline Capture — Wave -1

Durante Wave -1 (Baselining), é necessário coletar 7 dias contínuos de snapshots de baseline antes de avançar para Wave 0.

### Script automático

Script: `scripts/capture-baseline.sh`

O script chama `POST /api/admin/baseline/capture` uma vez e:
1. Valida token via env var `SNATCHER_ADMIN_TOKEN` (obrigatório)
2. Captura HTTP 201 + JSON response
3. Extrai `snapshot_id` via jq
4. Loga entry em `docs/baseline-captures.log`
5. Salva JSON completo em `docs/baseline-snapshots/YYYY-MM-DD.json`

Variáveis de env:
- `SNATCHER_API_URL` — URL da API (default: `http://localhost:8080`)
- `SNATCHER_ADMIN_TOKEN` — Bearer token obrigatório (exit 1 se vazio)
- `BASELINE_LOG` — Path do log (default: `docs/baseline-captures.log`)

Render HTTP status:
- `201` — sucesso, continue
- `4xx`/`5xx` — erro, log + exit 1

### Rodar manualmente (teste local)

```bash
# Pré-requisito: backend running + SNATCHER_ADMIN_TOKEN setado
export SNATCHER_API_URL=http://localhost:8080
export SNATCHER_ADMIN_TOKEN="<seu-token-aqui>"
export BASELINE_LOG="/workspace/.cache/snatcher/docs/baseline-captures.log"

/workspace/.cache/snatcher/scripts/capture-baseline.sh

# Verificar que logou OK
tail -5 /workspace/.cache/snatcher/docs/baseline-captures.log

# Verificar JSON salvo
ls -lh /workspace/.cache/snatcher/docs/baseline-snapshots/
```

### Cron entry (7 dias a 03:00 UTC)

Adicionar em `/etc/crontab` ou via `crontab -e` do usuário que roda o snatcher:

```cron
# Daily baseline capture at 03:00 UTC during W-1 (7 days total)
0 3 * * * /workspace/.cache/snatcher/scripts/capture-baseline.sh
```

Variáveis de env para cron:
```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SNATCHER_API_URL=http://localhost:8080
SNATCHER_ADMIN_TOKEN=<seu-token-aqui>
BASELINE_LOG=/workspace/.cache/snatcher/docs/baseline-captures.log

0 3 * * * /workspace/.cache/snatcher/scripts/capture-baseline.sh
```

### Alternativa: job interno (scheduler.go)

Se preferir auto-capture sem dependência de cron externo, adicionar em `internal/services/scheduler/scheduler.go`:

```go
sc.s.NewJob(
    gocron.CronJob("0 3 * * *", false),
    gocron.NewTask(func() {
        captureBaselineInternal(context.Background(), sc.db)
    }),
)
```

**Preferência**: cron externo durante W-1 (é mais seguro e não auto-executa após W-1 terminar).

### Validação de sucesso

Após 7 dias:

```bash
# 1. Verificar 7+ entradas no log
wc -l /workspace/.cache/snatcher/docs/baseline-captures.log

# 2. Verificar 7+ snapshots salvos
ls /workspace/.cache/snatcher/docs/baseline-snapshots/ | wc -l

# 3. Checar que todos têm snapshot_id
grep "snapshot_id" /workspace/.cache/snatcher/docs/baseline-captures.log | wc -l

# 4. Congelar em docs/baseline-2026-06.json (último snapshot)
cp /workspace/.cache/snatcher/docs/baseline-snapshots/$(date -d "7 days ago" +%Y-%m-%d).json \
   /workspace/.cache/snatcher/docs/baseline-2026-06.json

# Commit
git add docs/baseline-captures.log docs/baseline-snapshots/ docs/baseline-2026-06.json
git commit -m "Wave -1: baseline T-0 coletado (7 dias)"
```

---

## Sandbox Shadow — W6 (gate manual Pedro)

O sandbox shadow é a validação final do refactor V3: roda W1+W2+W5 com
dados de produção em shadow-copy por 7 dias e compara CTR e ban rate vs
baseline T-0 coletado em W-1.

**Por que é gate manual:** requer 7 dias de dados reais; não pode ser
automatizado numa sessão de execução de card.

### Procedimento

**Pré-requisito:** `docs/baseline-2026-06.json` deve existir (gerado em W-1).

```bash
# 1. Garantir que o ambiente sandbox está rodando com dados shadow-copy
docker compose -f docker-compose.snatcher.yml up -d

# 2. Aguardar 7 dias de coleta (dispatch_engine=1, bandit ativo, Jonfrey ativo)

# 3. Executar comparação vs baseline T-0
./scripts/sandbox-shadow-compare.sh \
  --baseline docs/baseline-2026-06.json \
  --window 7d

# 4. Critério de aprovação:
#    - ctr_per_channel_7d: delta_pct >= -5% (tolerância)
#    - ban_rate_per_channel: delta_pct <= +10% (tolerância)
#    - dispatch_latency_p95_ms: delta_pct <= +20% (tolerância)
#
# Resultado esperado na saída do script:
#    SANDBOX_SHADOW_PASS=true
```

### Em caso de falha

Se alguma métrica regredir além da tolerância:

1. Identificar o componente responsável via diff de métricas por canal.
2. Ajustar `tunable_parameters` via admin panel (não exige redeploy).
3. Aguardar 24h e reexecutar o script com `--window 1d` para validação rápida.
4. Se regressão persistir em ban rate: acionar `DecisionFreezeChannel` via Jonfrey.

### Após aprovação

Executar fase 3 do ADR-012 (drop das colunas legadas):

```bash
# Aplicar migration de drop (fase contract do expand-contract)
# Migration a criar: 20261001000000_catalog_status_drop_legacy.up.sql
# Conteúdo:
#   ALTER TABLE catalog DROP COLUMN IF EXISTS send_ready;
#   ALTER TABLE catalog DROP COLUMN IF EXISTS is_quarantined;
```

---

## Checklist de validação mensal

- [ ] Rodar backup manual e verificar tamanho (deve crescer)
- [ ] Restore em DB isolado com smoke query
- [ ] Checar `ls -lh /opt/snatcher/backups/` — confirmar que retention 30d está funcionando
- [ ] Checar cron: `crontab -l` e `tail -20 /var/log/snatcher-backup.log`
- [ ] Verificar health endpoints
- [ ] Revisar `ban_events` e `system_pauses` do mês
- [ ] Conferir `llm_autonomy.strikes_30d` — se algum loop tem > 3 strikes, investigar
- [ ] (Fase 8) Checar `/api/admin/diferenciais/status` — imagens cacheadas e grupos em decay
