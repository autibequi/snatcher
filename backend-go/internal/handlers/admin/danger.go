package admin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jmoiron/sqlx"

	store "snatcher/backendv2/internal/repositories"
)

type DangerHandler struct {
	db    *sqlx.DB
	store store.Store
}

func NewDangerHandler(db *sqlx.DB, st store.Store) *DangerHandler {
	return &DangerHandler{db: db, store: st}
}

// Frase obrigatória (validação apenas no servidor; o cliente só espelha o texto).
const softWipeConfirmPhrase = "EU CONFIRMO APAGAR TODOS OS DADOS OPERACIONAIS"

// SoftWipe POST /api/admin/danger/soft-wipe
// Body: { "confirm": "<frase exata>", "reseed_taxonomy": bool, "reseed_crawlers_channels": bool }
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
		Confirm                 string `json:"confirm"`
		ReseedTaxonomy          bool   `json:"reseed_taxonomy"`
		ReseedCrawlersChannels  bool   `json:"reseed_crawlers_channels"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	got := strings.TrimSpace(req.Confirm)
	if got != softWipeConfirmPhrase {
		writeErr(w, http.StatusBadRequest, "confirmação incorreta: digite a frase exata mostrada na zona de administração")
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
	if req.ReseedCrawlersChannels {
		if err := h.store.ReseedCrawlerChannelSeedInserts(); err != nil {
			writeErr(w, http.StatusInternalServerError, "soft wipe aplicado mas falhou ao reaplicar seeds de crawlers/canais: "+err.Error())
			return
		}
		out["reseed_crawlers_channels"] = true
	}
	writeJSON(w, http.StatusOK, out)
}
