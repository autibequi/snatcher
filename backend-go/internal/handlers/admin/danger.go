package admin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/store"
)

type DangerHandler struct {
	db    *sqlx.DB
	store store.Store
}

func NewDangerHandler(db *sqlx.DB, st store.Store) *DangerHandler {
	return &DangerHandler{db: db, store: st}
}

// SoftWipe POST /api/admin/danger/soft-wipe
// Body: { "confirm": "LIMPAR BASE", "reseed_taxonomy": bool }
// Apenas role admin.
func (h *DangerHandler) SoftWipe(w http.ResponseWriter, r *http.Request) {
	uid := UserIDFromCtx(r.Context())
	if uid == 0 {
		writeErr(w, http.StatusUnauthorized, "nao autenticado")
		return
	}
	var role string
	if err := h.db.GetContext(r.Context(), &role, `SELECT role FROM users WHERE id = $1`, uid); err != nil || role != "admin" {
		writeErr(w, http.StatusForbidden, "apenas administradores")
		return
	}

	var req struct {
		Confirm        string `json:"confirm"`
		ReseedTaxonomy bool   `json:"reseed_taxonomy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	const phrase = "LIMPAR BASE"
	if strings.TrimSpace(req.Confirm) != phrase {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("digite exatamente: %s", phrase))
		return
	}

	if err := h.store.SoftWipeOperationalData(); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao aplicar soft wipe")
		return
	}

	out := map[string]any{"ok": true, "soft_wipe": true}
	if req.ReseedTaxonomy {
		if err := h.store.ReseedTaxonomySeedInserts(); err != nil {
			writeErr(w, http.StatusInternalServerError, "soft wipe aplicado mas falhou ao reaplicar seeds de taxonomia: "+err.Error())
			return
		}
		out["reseed_taxonomy"] = true
	}
	writeJSON(w, http.StatusOK, out)
}
