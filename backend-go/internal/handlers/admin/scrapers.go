package admin

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// GET /api/admin/scrapers/configs?status=active
func ListScraperConfigsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		type row struct {
			ID           int64    `db:"id" json:"id"`
			SourceID     string   `db:"source_id" json:"source_id"`
			Field        string   `db:"field" json:"field"`
			Selector     string   `db:"selector" json:"selector"`
			Extractor    *string  `db:"extractor" json:"extractor,omitempty"`
			Version      int      `db:"version" json:"version"`
			Status       string   `db:"status" json:"status"`
			ShadowWeight *int     `db:"shadow_weight" json:"shadow_weight,omitempty"`
			SuccessRate  *float64 `db:"success_rate" json:"success_rate,omitempty"`
			Attempts     int      `db:"attempts" json:"attempts"`
			CreatedBy    string   `db:"created_by" json:"created_by"`
			CreatedAt    string   `db:"created_at" json:"created_at"`
			PromotedAt   *string  `db:"promoted_at" json:"promoted_at,omitempty"`
		}
		q := `SELECT id, source_id, field, selector, extractor, version, status, shadow_weight,
                     success_rate, attempts, created_by, created_at::text, promoted_at::text
              FROM scraper_configs`
		args := []any{}
		if status != "" {
			q += " WHERE status = $1"
			args = append(args, status)
		}
		q += " ORDER BY source_id, field, version DESC LIMIT 500"
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, q, args...); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}

// PUT /api/admin/scrapers/configs/{id}/selector — body: {selector}
func UpdateScraperSelectorHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body struct {
			Selector string `json:"selector"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad json", 400)
			return
		}
		if body.Selector == "" {
			http.Error(w, "selector is required", 400)
			return
		}
		if _, err := db.ExecContext(r.Context(), "UPDATE scraper_configs SET selector=$1, version=version+1 WHERE id=$2", body.Selector, id); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(204)
	}
}

// POST /api/admin/scrapers/configs/{id}/promote — promove shadow → active, arquiva active anterior
func PromoteShadowHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		tx, err := db.Beginx()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer tx.Rollback()
		var sourceID, field string
		if err := tx.QueryRowxContext(r.Context(),
			"SELECT source_id, field FROM scraper_configs WHERE id=$1 AND status='shadow'", id,
		).Scan(&sourceID, &field); err != nil {
			http.Error(w, "shadow config not found", 404)
			return
		}
		if _, err := tx.ExecContext(r.Context(),
			"UPDATE scraper_configs SET status='archived', archived_at=now() WHERE source_id=$1 AND field=$2 AND status='active'",
			sourceID, field,
		); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if _, err := tx.ExecContext(r.Context(),
			"UPDATE scraper_configs SET status='active', promoted_at=now() WHERE id=$1", id,
		); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(204)
	}
}

// GET /api/admin/scrapers/health  (mv_scraper_health snapshot)
func ScraperHealthHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			SourceID    string   `db:"source_id" json:"source_id"`
			Field       string   `db:"field" json:"field"`
			Attempts    int      `db:"attempts" json:"attempts"`
			SuccessRate *float64 `db:"success_rate" json:"success_rate,omitempty"`
			ComputedAt  string   `db:"computed_at" json:"computed_at"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows,
			`SELECT source_id, field, attempts, success_rate, computed_at::text
             FROM mv_scraper_health
             ORDER BY COALESCE(success_rate, 0) ASC, attempts DESC
             LIMIT 500`,
		); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}

// GET /api/admin/scrapers/logs?source_id=X&field=Y&limit=100
func ExtractionLogsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sourceID := r.URL.Query().Get("source_id")
		field := r.URL.Query().Get("field")
		type row struct {
			ID                   int64   `db:"id" json:"id"`
			SourceID             string  `db:"source_id" json:"source_id"`
			Field                string  `db:"field" json:"field"`
			ScraperConfigID      *int64  `db:"scraper_config_id" json:"scraper_config_id,omitempty"`
			ExtractionSuccessful bool    `db:"extraction_successful" json:"extraction_successful"`
			ErrorMessage         *string `db:"error_message" json:"error_message,omitempty"`
			AttemptedAt          string  `db:"attempted_at" json:"attempted_at"`
		}
		var rows []row
		q := `SELECT id, source_id, field, scraper_config_id, extraction_successful, error_message, attempted_at::text
              FROM extraction_logs WHERE 1=1`
		args := []any{}
		i := 1
		if sourceID != "" {
			q += " AND source_id=$" + scraperItoa(i)
			args = append(args, sourceID)
			i++
		}
		if field != "" {
			q += " AND field=$" + scraperItoa(i)
			args = append(args, field)
			i++
		}
		_ = i
		q += " ORDER BY attempted_at DESC LIMIT 100"
		if err := db.SelectContext(r.Context(), &rows, q, args...); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}

// scraperItoa converts small integers (1-9) to their ASCII string representation.
// Used to build parameterized query placeholders without importing strconv.
func scraperItoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}
