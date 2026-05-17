package webhooks

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/repositories"
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
	repo := repositories.NewAffiliateConversionsRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		var p AwinPostback
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		sourceID, err := repo.ResolveSourceID(r.Context(), "awin")
		if err != nil {
			slog.Error("awin.source_lookup", "err", err)
			http.Error(w, "source not found", http.StatusInternalServerError)
			return
		}

		catalogID, groupID := repo.LookupClickContext(r.Context(), p.SubID)

		raw, _ := json.Marshal(p)
		if err := repo.Insert(r.Context(), repositories.ConversionInsert{
			ShortID:      p.SubID,
			CatalogID:    catalogID,
			GroupID:      groupID,
			SourceID:     sourceID,
			ExternalTxID: p.TransactionID,
			OrderValue:   p.Amount,
			Commission:   p.Commission,
			Currency:     p.Currency,
			Status:       p.Status,
			OccurredAt:   p.TransactionDate,
			RawWebhook:   raw,
		}); err != nil {
			slog.Error("awin.insert", "err", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
