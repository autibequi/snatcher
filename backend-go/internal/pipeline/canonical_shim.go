package pipeline

import (
	"context"
	"encoding/json"
	"log/slog"

	"snatcher/backendv2/internal/models"

	"github.com/jmoiron/sqlx"
)

// WriteRawItem persiste um CrawlResult como raw_item se flag use_canonical_pipeline >= 1.
// Tolerante a erro — nunca bloqueia o fluxo principal.
func WriteRawItem(ctx context.Context, db *sqlx.DB, r models.CrawlResult) {
	if db == nil {
		return
	}
	// Gate: flag use_canonical_pipeline
	var flag float64
	if err := db.GetContext(ctx, &flag, "SELECT get_param('use_canonical_pipeline','global',NULL)"); err != nil || flag < 1 {
		return
	}
	payload, _ := json.Marshal(r)
	_, err := db.ExecContext(ctx, `
		INSERT INTO raw_items (source_id, payload, crawled_at, processed)
		SELECT s.id, $1, now(), false
		FROM sources s WHERE s.slug = $2
		LIMIT 1
	`, payload, r.Source)
	if err != nil {
		slog.Debug("canonical_shim: WriteRawItem", "err", err)
	}
}

// WriteDiscardedItem persiste um item rejeitado em discarded_items se flag use_canonical_pipeline >= 1.
// Tolerante a erro — nunca bloqueia o fluxo principal.
func WriteDiscardedItem(ctx context.Context, db *sqlx.DB, r models.CrawlResult, reason string) {
	if db == nil {
		return
	}
	// Gate: flag use_canonical_pipeline
	var flag float64
	if err := db.GetContext(ctx, &flag, "SELECT get_param('use_canonical_pipeline','global',NULL)"); err != nil || flag < 1 {
		return
	}
	payload, _ := json.Marshal(r)
	_, err := db.ExecContext(ctx, `
		INSERT INTO discarded_items (source_id, reason, payload, discarded_at)
		SELECT s.id, $1, $2, now()
		FROM sources s WHERE s.slug = $3
		LIMIT 1
	`, reason, payload, r.Source)
	if err != nil {
		slog.Debug("canonical_shim: WriteDiscardedItem", "err", err)
	}
}
