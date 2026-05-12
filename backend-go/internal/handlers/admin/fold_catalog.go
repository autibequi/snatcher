package admin

import (
	"net/http"

	"snatcher/backendv2/internal/jobs"

	"github.com/jmoiron/sqlx"
)

// FoldCatalogHandler expoe POST /api/admin/fold-catalog para disparar
// a migração one-shot de catalogvariant → catalog.
// Retorna 202 imediatamente; o job roda em goroutine background.
func FoldCatalogHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		go func() {
			_ = jobs.FoldCatalogVariantsIntoCatalog(r.Context(), db)
		}()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"started"}`))
	}
}
