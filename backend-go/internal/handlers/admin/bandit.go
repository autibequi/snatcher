package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/repositories"
)

// BanditResponse é o payload retornado pelo GET — retorna defaults vazios quando sem row.
type BanditResponse struct {
	ChannelID int64           `json:"channel_id"`
	Weights   json.RawMessage `json:"weights"`
	UCB1State json.RawMessage `json:"ucb1_state"`
	UpdatedAt *string         `json:"updated_at,omitempty"`
	UpdatedBy *string         `json:"updated_by,omitempty"`
}

// GetChannelBanditHandler implementa GET /api/admin/channels/{id}/bandit.
// Se não existe state para o canal, retorna { channel_id, weights: {}, ucb1_state: [] } — nunca 404.
func GetChannelBanditHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewBanditRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || channelID <= 0 {
			writeErr(w, http.StatusBadRequest, "channel id inválido")
			return
		}

		row, err := repo.Get(r.Context(), channelID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar bandit state: "+err.Error())
			return
		}

		// Sem state — retorna defaults vazios (frontend já trata).
		if row == nil {
			writeJSON(w, http.StatusOK, BanditResponse{
				ChannelID: channelID,
				Weights:   json.RawMessage(`{}`),
				UCB1State: json.RawMessage(`[]`),
			})
			return
		}

		var updatedAt *string
		if row.UpdatedAt != "" {
			updatedAt = &row.UpdatedAt
		}
		var updatedBy *string
		if row.UpdatedBy != "" {
			updatedBy = &row.UpdatedBy
		}

		writeJSON(w, http.StatusOK, BanditResponse{
			ChannelID: row.ChannelID,
			Weights:   json.RawMessage(row.Weights),
			UCB1State: json.RawMessage(row.UCB1State),
			UpdatedAt: updatedAt,
			UpdatedBy: updatedBy,
		})
	}
}

// ResetChannelBanditHandler implementa POST /api/admin/channels/{id}/bandit/reset.
// Remove a row de channel_score_weights; a próxima leitura recria com defaultSafeArms via LoadBandit.
func ResetChannelBanditHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewBanditRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || channelID <= 0 {
			writeErr(w, http.StatusBadRequest, "channel id inválido")
			return
		}

		if err := repo.Reset(r.Context(), channelID); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao resetar bandit state: "+err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
