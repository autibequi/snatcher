package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// DiferenciaisStatusHandler retorna status dos diferenciais implementados na Fase 8.
// GET /api/admin/diferenciais/status
func DiferenciaisStatusHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out := map[string]any{}

		var n int
		// Imagens cacheadas
		if err := db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog WHERE cached_image_path IS NOT NULL"); err == nil {
			out["images_cached"] = n
		} else {
			out["images_cached"] = nil
		}

		// Imagens pendentes de cache
		n = 0
		if err := db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog WHERE image_url IS NOT NULL AND cached_image_path IS NULL"); err == nil {
			out["images_pending"] = n
		} else {
			out["images_pending"] = nil
		}

		// Templates com optimal_hours configurados
		n = 0
		if err := db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM templates WHERE optimal_hours IS NOT NULL"); err == nil {
			out["templates_with_hours"] = n
		} else {
			out["templates_with_hours"] = nil
		}

		// Grupos em decay (ctr_drop_pct > 50)
		n = 0
		if err := db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM mv_group_health WHERE ctr_drop_pct > 50"); err == nil {
			out["groups_decaying"] = n
		} else {
			out["groups_decaying"] = nil
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
