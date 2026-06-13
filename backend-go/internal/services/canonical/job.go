package canonical

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/observability"
	"snatcher/backendv2/internal/repositories"
	"snatcher/backendv2/internal/services/dedup"
)

// BackfillStats agrega contadores de uma execução de RunBackfill.
type BackfillStats struct {
	Processed     int     // total de linhas processadas do batch
	LowConfidence int     // linhas com low_confidence=true (sem brand_id)
	Reused        int     // linhas que reutilizaram um canonical existente (deduplicadas)
	Inserted      int     // linhas que geraram um canonical novo
	DeduRatePct   float64 // Reused/Processed*100 (0 se Processed==0)
}

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
// Retorna (wasExisting, lowConf) para contabilização no BackfillStats do caller.
// Erros em upsert ou link são logados como warnings — não interrompem o lote.
// Em caso de erro no upsert, retorna (false, lowConf) e skip do link.
func processRow(ctx context.Context, db *sqlx.DB, row catalogRow) (wasExisting bool, lowConf bool) {
	band := priceBand(row.PriceCurrent)
	fpResult := dedup.Fingerprint(row.Title, row.BrandID, band)
	lowConf = fpResult.LowConfidence
	if fpResult.LowConfidence {
		slog.Debug("canonical.fingerprint_low_confidence",
			"catalog_id", row.ID,
			"title", row.Title,
		)
	}

	canonicalID, wasExisting, err := repositories.UpsertCanonical(
		ctx,
		db,
		fpResult.Hash[:],
		row.Title,
		row.BrandID,
		&band,
	)
	if err != nil {
		slog.Warn("canonical.upsert_error",
			"catalog_id", row.ID,
			"err", err,
		)
		return false, lowConf
	}

	if err := repositories.LinkCatalogToCanonical(ctx, db, row.ID, canonicalID); err != nil {
		slog.Warn("canonical.link_error",
			"catalog_id", row.ID,
			"canonical_id", canonicalID,
			"err", err,
		)
	}
	return wasExisting, lowConf
}

// RunBackfill processa catalog rows sem canonical_product_id em um único batch.
// Idempotente: linhas já com canonical_product_id são ignoradas pelo WHERE da query.
// Chamado por cron job ou manualmente pelo operador para popular o canonical cross-marketplace.
// Retorna BackfillStats com contadores de deduplicação além do erro.
func RunBackfill(ctx context.Context, db *sqlx.DB, batchSize int) (BackfillStats, error) {
	batch, err := fetchUnprocessedBatch(ctx, db, batchSize)
	if err != nil {
		return BackfillStats{}, err
	}

	var stats BackfillStats
	for _, row := range batch {
		wasExisting, lowConf := processRow(ctx, db, row)
		stats.Processed++
		if lowConf {
			stats.LowConfidence++
		}
		if wasExisting {
			stats.Reused++
		} else {
			stats.Inserted++
		}
	}

	if stats.Processed > 0 {
		stats.DeduRatePct = float64(stats.Reused) / float64(stats.Processed) * 100
	}

	slog.Info("canonical.backfill_complete",
		"processed", stats.Processed,
		"low_confidence", stats.LowConfidence,
		"reused", stats.Reused,
		"inserted", stats.Inserted,
		"dedup_rate_pct", stats.DeduRatePct,
	)

	observability.CanonicalDeduplicationRate.Set(stats.DeduRatePct)

	return stats, nil
}
