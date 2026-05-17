package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/repositories"
)

// GET /api/channels/{id}/brand-filters
func ChannelBrandFiltersListHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewChannelBrandFiltersRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		rows, err := repo.List(r.Context(), id)
		if err != nil {
			// Preserva semântica anterior: erro silencioso → lista vazia.
			rows = []repositories.ChannelBrandFilter{}
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// POST /api/channels/{id}/brand-filters
func ChannelBrandFiltersAddHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewChannelBrandFiltersRepo(db)
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
		if err := repo.Add(r.Context(), id, req.BrandSlug, req.BrandDisplay, req.Mode); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusCreated)
	}
}

// DELETE /api/channels/{id}/brand-filters/{filterId}
func ChannelBrandFiltersDeleteHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewChannelBrandFiltersRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		chID, ok1 := pathInt(r, "id")
		fID, ok2 := pathInt(r, "filterId")
		if !ok1 || !ok2 {
			writeErr(w, http.StatusBadRequest, "ids inválidos")
			return
		}
		if err := repo.Delete(r.Context(), chID, fID); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao remover filtro")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
