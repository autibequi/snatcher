package repositories

import (
	"context"

	"github.com/jmoiron/sqlx"
)

// ConversionInsert é o pacote de dados para Insert.
// Reaproveitado pelos webhooks (Awin, Mercado Livre, futuros).
type ConversionInsert struct {
	ShortID       string
	CatalogID     *int64
	GroupID       *int64
	SourceID      string
	ExternalTxID  string
	OrderValue    float64
	Commission    float64
	Currency      string
	Status        string
	OccurredAt    string
	RawWebhook    []byte
}

// AffiliateConversionsRepo isola SQL de conversões / sources / clicks
// dos webhooks de afiliados (handlers/public/webhooks/*).
type AffiliateConversionsRepo struct {
	DB *sqlx.DB
}

func NewAffiliateConversionsRepo(db *sqlx.DB) *AffiliateConversionsRepo {
	return &AffiliateConversionsRepo{DB: db}
}

// ResolveSourceID confirma que sources.id == id (ex.: 'awin', 'ml').
// Retorna ErrNoRows se inexistente.
func (r *AffiliateConversionsRepo) ResolveSourceID(ctx context.Context, id string) (string, error) {
	var out string
	err := r.DB.GetContext(ctx, &out, `SELECT id FROM sources WHERE id=$1`, id)
	return out, err
}

// LookupClickContext busca catalog_id e group_id do click mais recente daquele short_id.
// Erros em qualquer das duas leituras são tolerados (catalog/group podem ser nil) —
// preservação semântica do código original que ignorava errors.
func (r *AffiliateConversionsRepo) LookupClickContext(ctx context.Context, shortID string) (catalogID, groupID *int64) {
	_ = r.DB.GetContext(ctx, &catalogID,
		`SELECT catalog_id FROM clicks WHERE short_id=$1 ORDER BY clicked_at DESC LIMIT 1`, shortID)
	_ = r.DB.GetContext(ctx, &groupID,
		`SELECT group_id  FROM clicks WHERE short_id=$1 ORDER BY clicked_at DESC LIMIT 1`, shortID)
	return
}

// Insert grava uma conversão de forma idempotente — ON CONFLICT (external_tx_id, source_id).
func (r *AffiliateConversionsRepo) Insert(ctx context.Context, in ConversionInsert) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO conversions
		  (short_id, catalog_id, group_id, source_id, external_tx_id,
		   order_value, commission, currency, status, occurred_at, raw_webhook)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, now()), $11)
		ON CONFLICT (external_tx_id, source_id) DO NOTHING
	`, in.ShortID, in.CatalogID, in.GroupID, in.SourceID, in.ExternalTxID,
		in.OrderValue, in.Commission, in.Currency, in.Status, in.OccurredAt, in.RawWebhook)
	return err
}
