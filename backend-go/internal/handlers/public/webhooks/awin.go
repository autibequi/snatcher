package webhooks

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// AwinPostback representa o payload POST do Awin postback.
type AwinPostback struct {
	TransactionID   string  `json:"transactionId"`
	AffiliateID     string  `json:"affiliateId"`
	MerchantID      string  `json:"merchantId"`
	SubID           string  `json:"subId"` // = short_id injetado
	Amount          float64 `json:"saleAmount"`
	Commission      float64 `json:"commission"`
	Currency        string  `json:"currency"`
	Status          string  `json:"status"`
	TransactionDate string  `json:"transactionDate"`
}

// HandleAwinPostback processa postbacks POST do Awin.
// Idempotente via UNIQUE (external_tx_id, source_id). Insere em conversions.
func HandleAwinPostback(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p AwinPostback
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		// resolve source_id
		var sourceID int64
		if err := db.GetContext(r.Context(), &sourceID, "SELECT id FROM sources WHERE slug='awin'"); err != nil {
			slog.Error("awin.source_lookup", "err", err)
			http.Error(w, "source not found", http.StatusInternalServerError)
			return
		}

		// resolve catalog_id + group_id via clicks (última entrada para esse short_id)
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
		`, p.SubID, catalogID, groupID, sourceID, p.TransactionID, p.Amount, p.Commission, p.Currency, p.Status, p.TransactionDate, raw)
		if err != nil {
			slog.Error("awin.insert", "err", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
