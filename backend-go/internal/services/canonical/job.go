package canonical

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/repositories"
	"snatcher/backendv2/internal/services/algo"
)

// catalogRow representa os campos de catalog necessários para o backfill canonical.
type catalogRow struct {
	ID           int64   `db:"id"`
	Title        string  `db:"title"`
	BrandID      *int64  `db:"brand_id"`
	PriceCurrent float64 `db:"price_current"`
}

// fetchUnprocessedBatch busca um lote de linhas de catalog sem canonical_product_id.
// Ordena por id para garantir progressão determinística a cada execução.
func fetchUnprocessedBatch(ctx context.Context, db *sqlx.DB, batchSize int) ([]catalogRow, error) {
	var batch []catalogRow
	err := db.SelectContext(
		ctx,
		&batch,
		`SELECT id, title, brand_id, price_current
		 FROM catalog
		 WHERE canonical_product_id IS NULL
		 ORDER BY id
		 LIMIT $1`,
		batchSize,
	)
	return batch, err
}

// priceBand converte um preço float em bucket inteiro.
// Buckets simples por faixa de valor: 0=[0,10), 1=[10,50), 2=[50,100), 3=[100,500), 4=[500,1000), 5=1000+.
func priceBand(price float64) int {
	switch {
	case price < 10:
		return 0
	case price < 50:
		return 1
	case price < 100:
		return 2
	case price < 500:
		return 3
	case price < 1000:
		return 4
	default:
		return 5
	}
}

// processRow computa a fingerprint do item, faz upsert do canonical e vincula ao catalog.
// Erros em upsert ou link são logados como warnings — não interrompem o lote.
func processRow(ctx context.Context, db *sqlx.DB, row catalogRow) {
	band := priceBand(row.PriceCurrent)
	fingerprint := algo.Fingerprint(row.Title, row.BrandID, band)

	canonicalID, err := repositories.UpsertCanonical(
		ctx,
		db,
		fingerprint[:],
		row.Title,
		row.BrandID,
		&band,
	)
	if err != nil {
		slog.Warn("canonical.upsert_error",
			"catalog_id", row.ID,
			"err", err,
		)
		return
	}

	if err := repositories.LinkCatalogToCanonical(ctx, db, row.ID, canonicalID); err != nil {
		slog.Warn("canonical.link_error",
			"catalog_id", row.ID,
			"canonical_id", canonicalID,
			"err", err,
		)
	}
}

// RunBackfill processa catalog rows sem canonical_product_id em um único batch.
// Idempotente: linhas já com canonical_product_id são ignoradas pelo WHERE da query.
// Chamado por cron job ou manualmente pelo operador para popular o canonical cross-marketplace.
func RunBackfill(ctx context.Context, db *sqlx.DB, batchSize int) error {
	batch, err := fetchUnprocessedBatch(ctx, db, batchSize)
	if err != nil {
		return err
	}

	for _, row := range batch {
		processRow(ctx, db, row)
	}

	return nil
}
