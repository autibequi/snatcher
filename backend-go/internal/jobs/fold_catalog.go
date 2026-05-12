package jobs

import (
	"context"
	"crypto/sha1"
	"fmt"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// FoldCatalogVariantsIntoCatalog migra cada catalogvariant para catalog (idempotente via dedup_key UNIQUE).
// Roda 1x via comando manual (cmd/seed extension) ou endpoint admin.
func FoldCatalogVariantsIntoCatalog(ctx context.Context, db *sqlx.DB) error {
	rows, err := db.QueryxContext(ctx, `
		SELECT v.id, v.short_id, v.canonical_name, v.lowest_price_url, v.lowest_price_value,
		       p.short_id AS parent_short
		FROM catalogvariant v
		LEFT JOIN catalogproduct p ON p.id = v.catalog_product_id
		WHERE v.lowest_price_value IS NOT NULL
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	inserted := 0
	for rows.Next() {
		var vid int64
		var shortID, parentShort *string
		var name, url *string
		var price *float64
		if err := rows.Scan(&vid, &shortID, &name, &url, &price, &parentShort); err != nil {
			continue
		}
		if shortID == nil || url == nil {
			continue
		}
		// dedup_key heurístico: variant.short_id || sha1(url)
		h := sha1.Sum([]byte(*url))
		dedup := fmt.Sprintf("variant:%s", *shortID)
		contentHash := fmt.Sprintf("%x", h[:])

		_, err := db.ExecContext(ctx, `
			INSERT INTO catalog (dedup_key, short_id, source_id, title, price_current, canonical_url, content_hash, send_ready)
			SELECT $1, $2, COALESCE((SELECT id FROM sources WHERE slug = 'unknown'), 1), $3, $4, $5, $6, false
			ON CONFLICT (dedup_key) DO NOTHING
		`, dedup, *shortID, *name, *price, *url, contentHash)
		if err == nil {
			inserted++
		}
	}
	slog.Info("fold_catalog: done", "inserted", inserted)
	return nil
}
