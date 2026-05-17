package webhooks

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/repositories"
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
	repo := repositories.NewAffiliateConversionsRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		var p MLPostback
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		sourceID, err := repo.ResolveSourceID(r.Context(), "ml")
		if err != nil {
			slog.Error("mercadolivre.source_lookup", "err", err)
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
			ExternalTxID: p.OrderID,
			OrderValue:   p.AffiliateAmount,
			Commission:   p.CommissionValue,
			Currency:     p.Currency,
			Status:       p.Status,
			OccurredAt:   p.OccurredAt,
			RawWebhook:   raw,
		}); err != nil {
			slog.Error("mercadolivre.insert", "err", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
