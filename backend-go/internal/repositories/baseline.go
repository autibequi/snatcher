// Package repositories — baseline snapshot persistence.
// CaptureSnapshot executa queries de métricas pré-refactor e persiste cada
// resultado como uma linha em baseline_snapshots (1 linha por métrica).
// Se uma query falhar (coluna inexistente, tabela vazia), o value_numeric/value_json
// fica NULL e um campo "note" é adicionado ao JSON retornado — não derruba o snapshot.
package repositories

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// SnapshotMeta agrupa metadados de um snapshot (sem as linhas individuais de métrica).
type SnapshotMeta struct {
	ID         int64     `db:"id"          json:"id"`
	CapturedAt time.Time `db:"captured_at" json:"captured_at"`
	Scope      string    `db:"scope"       json:"scope"`
}

// SnapshotRow representa uma linha de baseline_snapshots incluindo o valor.
type SnapshotRow struct {
	ID            int64    `db:"id"            json:"id"`
	CapturedAt    time.Time `db:"captured_at"   json:"captured_at"`
	Scope         string   `db:"scope"         json:"scope"`
	MetricName    string   `db:"metric_name"   json:"metric_name"`
	ValueNumeric  *float64 `db:"value_numeric" json:"value_numeric,omitempty"`
	ValueJSON     *string  `db:"value_json"    json:"value_json,omitempty"`
}

// metricResult guarda o resultado de captura de uma métrica.
type metricResult struct {
	numeric *float64
	jsonVal *string
	note    string // preenchido quando a query falhou gracefully
}

// CaptureSnapshot captura todas as métricas de baselining e persiste em
// baseline_snapshots. Retorna o snapshotID (shared por todas as linhas desse
// snapshot), o timestamp e um mapa nome→valor para a resposta HTTP.
// Falhas individuais de métrica são logadas e retornam null nos valores.
func CaptureSnapshot(ctx context.Context, db *sqlx.DB, scope string) (int64, time.Time, map[string]interface{}, error) {
	if scope == "" {
		scope = "global"
	}

	capturedAt := time.Now().UTC()

	metrics := captureAllMetrics(ctx, db)

	// Persistir cada métrica em uma transação.
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return 0, capturedAt, nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var snapshotID int64
	for name, res := range metrics {
		var id int64
		err := tx.QueryRowxContext(ctx, `
			INSERT INTO baseline_snapshots (captured_at, scope, metric_name, value_numeric, value_json)
			VALUES ($1, $2, $3, $4, $5::jsonb)
			RETURNING id
		`, capturedAt, scope, name, res.numeric, res.jsonVal).Scan(&id)
		if err != nil {
			return 0, capturedAt, nil, fmt.Errorf("insert metric %s: %w", name, err)
		}
		if snapshotID == 0 {
			snapshotID = id
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, capturedAt, nil, fmt.Errorf("commit: %w", err)
	}

	// Montar mapa de resposta.
	result := make(map[string]interface{}, len(metrics))
	for name, res := range metrics {
		entry := map[string]interface{}{}
		if res.numeric != nil {
			entry["value"] = *res.numeric
		} else if res.jsonVal != nil {
			var parsed interface{}
			if err := json.Unmarshal([]byte(*res.jsonVal), &parsed); err == nil {
				entry["value"] = parsed
			} else {
				entry["value"] = *res.jsonVal
			}
		} else {
			entry["value"] = nil
		}
		if res.note != "" {
			entry["note"] = res.note
		}
		result[name] = entry
	}

	return snapshotID, capturedAt, result, nil
}

// captureAllMetrics executa as queries de cada métrica de forma independente.
// Erros individuais resultam em valor null + note.
func captureAllMetrics(ctx context.Context, db *sqlx.DB) map[string]*metricResult {
	out := make(map[string]*metricResult)

	// ── ban_rate_per_channel ─────────────────────────────────────────────────
	// Proxy: proporção de contas em status='quarantine' ou 'banned' por modem_id.
	// Não existe canal direto, modem_id é o agrupador mais próximo.
	out["ban_rate_per_channel"] = captureJSON(ctx, db, `
		SELECT jsonb_object_agg(modem_id::text, total_ban::float / NULLIF(total, 0))
		FROM (
			SELECT modem_id,
			       COUNT(*) FILTER (WHERE status IN ('quarantine','banned')) AS total_ban,
			       COUNT(*) AS total
			FROM accounts
			GROUP BY modem_id
		) sub
		WHERE total > 0
	`)

	// ── dispatch_latency_p95_ms / p99_ms ────────────────────────────────────
	// send_log tem started_at e finished_at (nullable).
	out["dispatch_latency_p95_ms"] = captureNumeric(ctx, db, `
		SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)
		FROM send_log
		WHERE started_at > now() - interval '7 days'
		  AND finished_at IS NOT NULL
	`)
	out["dispatch_latency_p99_ms"] = captureNumeric(ctx, db, `
		SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)
		FROM send_log
		WHERE started_at > now() - interval '7 days'
		  AND finished_at IS NOT NULL
	`)

	// ── queue_depth_p95 ──────────────────────────────────────────────────────
	// Sem histórico de profundidade; usamos COUNT atual de pending como spot value.
	out["queue_depth_p95"] = captureNumeric(ctx, db, `
		SELECT COUNT(*)::float FROM send_queue WHERE status = 'pending'
	`)

	// ── llm_cost_today_usd_total ─────────────────────────────────────────────
	out["llm_cost_today_usd_total"] = captureNumeric(ctx, db, `
		SELECT COALESCE(SUM(estimated_cost_usd), 0)
		FROM llm_metrics
		WHERE created_at::date = current_date
	`)

	// ── llm_cost_today_per_provider ──────────────────────────────────────────
	out["llm_cost_today_per_provider"] = captureJSON(ctx, db, `
		SELECT jsonb_object_agg(NULLIF(provider, ''), total_cost)
		FROM (
			SELECT COALESCE(NULLIF(provider,''), 'unknown') AS provider,
			       SUM(estimated_cost_usd) AS total_cost
			FROM llm_metrics
			WHERE created_at::date = current_date
			GROUP BY provider
		) sub
	`)

	// ── quarantine_events_today ──────────────────────────────────────────────
	// redirect_domains com quarantine_until no futuro = em quarentena agora.
	out["quarantine_events_today"] = captureNumeric(ctx, db, `
		SELECT COUNT(*)::float FROM redirect_domains WHERE quarantine_until > now()
	`)

	// ── discount_zero_messages_today ─────────────────────────────────────────
	// Depende de card 007 (last_error em send_queue). Retorna null com note.
	out["discount_zero_messages_today"] = &metricResult{
		note: "no_data_source: send_queue.last_error não existe ainda (aguarda card 007)",
	}

	// ── ctr_per_channel_7d ───────────────────────────────────────────────────
	// Sem fonte de dados de CTR no schema atual.
	out["ctr_per_channel_7d"] = &metricResult{
		jsonVal: strPtr("{}"),
		note:    "no_data_source: sem tabela de clicks por canal no schema atual",
	}

	return out
}

// captureNumeric executa q, espera uma única coluna NUMERIC e retorna metricResult.
func captureNumeric(ctx context.Context, db *sqlx.DB, q string) *metricResult {
	var val *float64
	err := db.QueryRowxContext(ctx, q).Scan(&val)
	if err != nil {
		slog.Warn("baseline: captureNumeric failed", "err", err, "query", q[:min(60, len(q))])
		return &metricResult{note: fmt.Sprintf("query_error: %v", err)}
	}
	return &metricResult{numeric: val}
}

// captureJSON executa q, espera uma única coluna JSONB e retorna metricResult.
func captureJSON(ctx context.Context, db *sqlx.DB, q string) *metricResult {
	var raw *string
	err := db.QueryRowxContext(ctx, q).Scan(&raw)
	if err != nil {
		slog.Warn("baseline: captureJSON failed", "err", err, "query", q[:min(60, len(q))])
		return &metricResult{note: fmt.Sprintf("query_error: %v", err)}
	}
	if raw == nil {
		return &metricResult{jsonVal: strPtr("{}")}
	}
	return &metricResult{jsonVal: raw}
}

func strPtr(s string) *string { return &s }

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ListSnapshots retorna os últimos `limit` snapshots distintos (por captured_at + scope),
// sem as linhas de métrica individuais. Para obter métricas, use GetSnapshot.
func ListSnapshots(ctx context.Context, db *sqlx.DB, limit int) ([]SnapshotMeta, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []SnapshotMeta
	err := db.SelectContext(ctx, &rows, `
		SELECT DISTINCT ON (captured_at, scope)
		       id, captured_at, scope
		FROM baseline_snapshots
		ORDER BY captured_at DESC, scope, id
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list snapshots: %w", err)
	}
	if rows == nil {
		rows = []SnapshotMeta{}
	}
	return rows, nil
}

// GetSnapshot retorna todas as linhas de baseline_snapshots com o captured_at
// do snapshot identificado por id. Usamos captured_at + scope para agrupar
// porque o snapshot_id é apenas o primeiro id inserido na transação.
func GetSnapshot(ctx context.Context, db *sqlx.DB, id int64) ([]SnapshotRow, error) {
	// Buscar captured_at e scope do id de referência.
	var ref struct {
		CapturedAt time.Time `db:"captured_at"`
		Scope      string    `db:"scope"`
	}
	if err := db.GetContext(ctx, &ref, `
		SELECT captured_at, scope FROM baseline_snapshots WHERE id = $1
	`, id); err != nil {
		return nil, fmt.Errorf("snapshot %d not found: %w", id, err)
	}

	var rows []SnapshotRow
	err := db.SelectContext(ctx, &rows, `
		SELECT id, captured_at, scope, metric_name,
		       value_numeric::float8 AS value_numeric,
		       value_json::text AS value_json
		FROM baseline_snapshots
		WHERE captured_at = $1 AND scope = $2
		ORDER BY metric_name
	`, ref.CapturedAt, ref.Scope)
	if err != nil {
		return nil, fmt.Errorf("get snapshot rows: %w", err)
	}
	return rows, nil
}

// CompareSnapshots retorna um diff entre dois snapshots. Para cada métrica
// presente em ambos com value_numeric, calcula delta_pct.
func CompareSnapshots(ctx context.Context, db *sqlx.DB, fromID, toID int64) (map[string]interface{}, error) {
	fromRows, err := GetSnapshot(ctx, db, fromID)
	if err != nil {
		return nil, fmt.Errorf("from snapshot: %w", err)
	}
	toRows, err := GetSnapshot(ctx, db, toID)
	if err != nil {
		return nil, fmt.Errorf("to snapshot: %w", err)
	}

	// Indexar por metric_name.
	fromMap := indexRows(fromRows)
	toMap := indexRows(toRows)

	diff := make(map[string]interface{})
	for name, fromRow := range fromMap {
		toRow, ok := toMap[name]
		if !ok {
			continue
		}
		if fromRow.ValueNumeric == nil || toRow.ValueNumeric == nil {
			diff[name] = map[string]interface{}{
				"before": fromRow.ValueNumeric,
				"after":  toRow.ValueNumeric,
				"note":   "non-numeric metric — delta_pct not computed",
			}
			continue
		}
		before := *fromRow.ValueNumeric
		after := *toRow.ValueNumeric
		var deltaPct *float64
		if before != 0 {
			v := (after - before) / before * 100
			deltaPct = &v
		}
		diff[name] = map[string]interface{}{
			"before":    before,
			"after":     after,
			"delta_pct": deltaPct,
		}
	}

	return diff, nil
}

func indexRows(rows []SnapshotRow) map[string]*SnapshotRow {
	m := make(map[string]*SnapshotRow, len(rows))
	for i := range rows {
		m[rows[i].MetricName] = &rows[i]
	}
	return m
}
