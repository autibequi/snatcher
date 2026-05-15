package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// GET /api/channels/{id}/brand-filters
func ChannelBrandFiltersListHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		type row struct {
			ID           int64  `db:"id"            json:"id"`
			BrandSlug    string `db:"brand_slug"    json:"brand_slug"`
			BrandDisplay string `db:"brand_display" json:"brand_display"`
			Mode         string `db:"mode"          json:"mode"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows,
			`SELECT id, brand_slug, brand_display, mode FROM channel_brand_filters WHERE channel_id=$1 ORDER BY mode, brand_slug`, id,
		); err != nil {
			rows = []row{}
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// POST /api/channels/{id}/brand-filters
func ChannelBrandFiltersAddHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		var req struct {
			BrandSlug    string `json:"brand_slug"`
			BrandDisplay string `json:"brand_display"`
			Mode         string `json:"mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.BrandSlug == "" {
			writeErr(w, http.StatusBadRequest, "brand_slug obrigatório")
			return
		}
		if req.Mode == "" {
			req.Mode = "include"
		}
		if req.BrandDisplay == "" {
			req.BrandDisplay = req.BrandSlug
		}
		_, err := db.ExecContext(r.Context(), `
            INSERT INTO channel_brand_filters (channel_id, brand_slug, brand_display, mode)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (channel_id, brand_slug, mode) DO NOTHING
        `, id, req.BrandSlug, req.BrandDisplay, req.Mode)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusCreated)
	}
}

// DELETE /api/channels/{id}/brand-filters/{filterId}
func ChannelBrandFiltersDeleteHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		chID, ok1 := pathInt(r, "id")
		fID, ok2 := pathInt(r, "filterId")
		if !ok1 || !ok2 {
			writeErr(w, http.StatusBadRequest, "ids inválidos")
			return
		}
		db.ExecContext(r.Context(), `DELETE FROM channel_brand_filters WHERE id=$1 AND channel_id=$2`, fID, chID)
		w.WriteHeader(http.StatusNoContent)
	}
}
