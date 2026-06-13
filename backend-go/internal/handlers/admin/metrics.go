package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/metrics/virality
// Retorna por grupo: clicks totais, esperado pelos members, excedente viral
// e ratio de viralização (excedente / total).
func ViralityHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			GroupID          int64   `db:"group_id"          json:"group_id"`
			GroupName        *string `db:"group_name"        json:"group_name,omitempty"`
			ChannelName      *string `db:"channel_name"      json:"channel_name,omitempty"`
			ClicksTotal      int64   `db:"clicks_total"      json:"clicks_total"`
			UniqueLinks      int64   `db:"unique_links"      json:"unique_links"`
			MemberCount      int64   `db:"member_count"      json:"member_count"`
			ExpectedMax      int64   `db:"expected_max"      json:"expected_max"`
			ClicksExcedentes int64   `db:"clicks_excedentes" json:"clicks_excedentes"`
			ViralityRatio    float64 `db:"virality_ratio"    json:"virality_ratio"`
		}
		var rows []row
		_ = db.SelectContext(r.Context(), &rows, `
			SELECT v.group_id,
			       g.name AS group_name,
			       ch.name AS channel_name,
			       v.clicks_total, v.unique_links, v.member_count,
			       v.expected_max, v.clicks_excedentes, v.virality_ratio
			FROM group_virality v
			LEFT JOIN groups g       ON g.id = v.group_id
			LEFT JOIN channels_v2 ch ON ch.id = g.channel_id
			ORDER BY v.virality_ratio DESC NULLS LAST, v.clicks_total DESC
			LIMIT 200
		`)
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// GET /api/admin/metrics/daily?days=30&metric=sent
func DailyMetricsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 30
		if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && v > 0 && v <= 365 {
			days = v
		}
		metric := r.URL.Query().Get("metric")

		type row struct {
			Date      string  `db:"date" json:"-"`
			Metric    string  `db:"metric" json:"-"`
			Dimension []byte  `db:"dimension" json:"-"`
			Value     float64 `db:"value" json:"-"`
		}
		type wrapped struct {
			Date      string          `json:"date"`
			Metric    string          `json:"metric"`
			Dimension json.RawMessage `json:"dimension"`
			Value     float64         `json:"value"`
		}

		q := `SELECT date::text, metric, dimension, value FROM daily_metrics WHERE date > CURRENT_DATE - $1`
		args := []any{days}
		if metric != "" {
			q += " AND metric = $2"
			args = append(args, metric)
		}
		q += " ORDER BY date DESC, metric LIMIT 2000"

		var rows []row
		_ = db.SelectContext(r.Context(), &rows, q, args...)

		out := make([]wrapped, len(rows))
		for i, r := range rows {
			dim := json.RawMessage(r.Dimension)
			if len(dim) == 0 {
				dim = json.RawMessage(`{}`)
			}
			out[i] = wrapped{
				Date:      r.Date,
				Metric:    r.Metric,
				Dimension: dim,
				Value:     r.Value,
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}

// GET /api/admin/metrics/ab-tests?status=running
func ABTestsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")

		type row struct {
			ID              int64    `db:"id" json:"id"`
			ParamID         int64    `db:"param_id" json:"param_id"`
			ParamName       string   `db:"param_name" json:"param_name"`
			ProposedValue   float64  `db:"proposed_value" json:"proposed_value"`
			CurrentValue    float64  `db:"current_value" json:"current_value"`
			WeightPct       int      `db:"weight_pct" json:"weight_pct"`
			MetricName      string   `db:"metric_name" json:"metric_name"`
			MetricBaseline  *float64 `db:"metric_baseline" json:"metric_baseline,omitempty"`
			MetricTest      *float64 `db:"metric_test" json:"metric_test,omitempty"`
			SamplesBaseline int      `db:"samples_baseline" json:"samples_baseline"`
			SamplesTest     int      `db:"samples_test" json:"samples_test"`
			Status          string   `db:"status" json:"status"`
			StartedAt       string   `db:"started_at" json:"started_at"`
			EndsAt          string   `db:"ends_at" json:"ends_at"`
			DecidedAt       *string  `db:"decided_at" json:"decided_at,omitempty"`
		}

		q := `SELECT ab.id, ab.param_id, tp.param_name, ab.proposed_value, tp.current_value,
		             ab.weight_pct, ab.metric_name, ab.metric_baseline, ab.metric_test,
		             ab.samples_baseline, ab.samples_test, ab.status,
		             ab.started_at::text, ab.ends_at::text, ab.decided_at::text
		      FROM parameter_ab_tests ab
		      JOIN tunable_parameters tp ON tp.id = ab.param_id`
		args := []any{}
		if status != "" {
			q += " WHERE ab.status = $1"
			args = append(args, status)
		}
		q += " ORDER BY ab.started_at DESC LIMIT 100"

		var rows []row
		_ = db.SelectContext(r.Context(), &rows, q, args...)
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		_ = json.NewEncoder(w).Encode(rows)
	}
}
