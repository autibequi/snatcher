package webhooks

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// MLPostback representa o payload POST do Mercado Livre.
type MLPostback struct {
	OrderID         string  `json:"order_id"`
	AffiliateAmount float64 `json:"affiliate_amount"`
	CommissionValue float64 `json:"commission_value"`
	Currency        string  `json:"currency"`
	Status          string  `json:"status"`
	EventType       string  `json:"event_type"`
	SubID           string  `json:"sub_id"` // = short_id injetado
	OccurredAt      string  `json:"occurred_at"`
}

// HandleMLPostback processa postbacks POST do Mercado Livre.
// Idempotente via UNIQUE (external_tx_id, source_id). Insere em conversions.
func HandleMLPostback(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p MLPostback
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		// resolve source_id
		var sourceID string
		if err := db.GetContext(r.Context(), &sourceID, "SELECT id FROM sources WHERE id='ml'"); err != nil {
			slog.Error("mercadolivre.source_lookup", "err", err)
			http.Error(w, "source not found", http.StatusInternalServerError)
			return
		}

		// resolve catalog_id + group_id via clicks
		var catalogID, groupID *int64
		_ = db.GetContext(r.Context(), &catalogID,
			"SELECT catalog_id FROM clicks WHERE short_id=$1 ORDER BY clicked_at DESC LIMIT 1", p.SubID)
		_ = db.GetContext(r.Context(), &groupID,
			"SELECT group_id FROM clicks WHERE short_id=$1 ORDER BY clicked_at DESC LIMIT 1", p.SubID)

		// idempotent insert
		raw, _ := json.Marshal(p)
		_, err := db.ExecContext(r.Context(), `
			INSERT INTO conversions (short_id, catalog_id, group_id, source_id, external_tx_id, order_value, commission, currency, status, occurred_at, raw_webhook)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, now()), $11)
			ON CONFLICT (external_tx_id, source_id) DO NOTHING
		`, p.SubID, catalogID, groupID, sourceID, p.OrderID, p.AffiliateAmount, p.CommissionValue, p.Currency, p.Status, p.OccurredAt, raw)
		if err != nil {
			slog.Error("mercadolivre.insert", "err", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
