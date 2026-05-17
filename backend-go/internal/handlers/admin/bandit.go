package admin

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// BanditStateRow representa o estado bandit de um canal (channel_score_weights).
type BanditStateRow struct {
	ChannelID  int64  `db:"channel_id"  json:"channel_id"`
	Weights    string `db:"weights"     json:"weights"`
	UCB1State  string `db:"ucb1_state"  json:"ucb1_state"`
	UpdatedAt  string `db:"updated_at"  json:"updated_at"`
	UpdatedBy  string `db:"updated_by"  json:"updated_by"`
}

// BanditResponse é o payload retornado pelo GET — retorna defaults vazios quando sem row.
type BanditResponse struct {
	ChannelID  int64           `json:"channel_id"`
	Weights    json.RawMessage `json:"weights"`
	UCB1State  json.RawMessage `json:"ucb1_state"`
	UpdatedAt  *string         `json:"updated_at,omitempty"`
	UpdatedBy  *string         `json:"updated_by,omitempty"`
}

// fetchChannelBandit busca o estado bandit de um canal.
// Retorna nil, nil quando não existe row (tabela vazia ou canal sem state).
func fetchChannelBandit(r *http.Request, db *sqlx.DB, channelID int64) (*BanditStateRow, error) {
	var row BanditStateRow
	err := db.GetContext(r.Context(), &row, `
		SELECT channel_id,
		       COALESCE(weights::text, '{}') AS weights,
		       COALESCE(ucb1_state::text, '[]') AS ucb1_state,
		       COALESCE(updated_at::text, '') AS updated_at,
		       COALESCE(updated_by, '') AS updated_by
		FROM channel_score_weights
		WHERE channel_id = $1
	`, channelID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &row, err
}

// deleteChannelBandit remove o state bandit de um canal (reset completo).
func deleteChannelBandit(r *http.Request, db *sqlx.DB, channelID int64) error {
	_, err := db.ExecContext(r.Context(), `
		DELETE FROM channel_score_weights WHERE channel_id = $1
	`, channelID)
	return err
}

// GetChannelBanditHandler implementa GET /api/admin/channels/{id}/bandit.
// Se não existe state para o canal, retorna { channel_id, weights: {}, ucb1_state: [] } — nunca 404.
func GetChannelBanditHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || channelID <= 0 {
			writeErr(w, http.StatusBadRequest, "channel id inválido")
			return
		}

		row, err := fetchChannelBandit(r, db, channelID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar bandit state: "+err.Error())
			return
		}

		// Quando não existe state para o canal, retornar defaults vazios (frontend já trata).
		if row == nil {
			resp := BanditResponse{
				ChannelID: channelID,
				Weights:   json.RawMessage(`{}`),
				UCB1State: json.RawMessage(`[]`),
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
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

		resp := BanditResponse{
			ChannelID: row.ChannelID,
			Weights:   json.RawMessage(row.Weights),
			UCB1State: json.RawMessage(row.UCB1State),
			UpdatedAt: updatedAt,
			UpdatedBy: updatedBy,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// ResetChannelBanditHandler implementa POST /api/admin/channels/{id}/bandit/reset.
// Remove a row de channel_score_weights; a próxima leitura recria com defaultSafeArms via LoadBandit.
func ResetChannelBanditHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || channelID <= 0 {
			writeErr(w, http.StatusBadRequest, "channel id inválido")
			return
		}

		if err := deleteChannelBandit(r, db, channelID); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao resetar bandit state: "+err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
