package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

// CanonicalProduct representa uma linha da tabela canonical_products.
// Agrupa produtos idênticos de múltiplos marketplaces sob um único registro.
type CanonicalProduct struct {
	ID             int64  `db:"id"`
	Fingerprint    []byte `db:"fingerprint"`
	TitleCanonical string `db:"title_canonical"`
	BrandID        *int64 `db:"brand_id"`
	PriceBand      *int   `db:"price_band"`
	LowConfidence  bool   `db:"low_confidence"`
}

// findCanonicalByFingerprint busca um canonical existente com a fingerprint dada.
// Retorna (0, sql.ErrNoRows) se não encontrado.
func findCanonicalByFingerprint(ctx context.Context, db *sqlx.DB, fingerprint []byte) (int64, error) {
	var id int64
	err := db.GetContext(
		ctx,
		&id,
		`SELECT id FROM canonical_products WHERE fingerprint = $1 AND low_confidence = FALSE`,
		fingerprint,
	)
	return id, err
}

// insertCanonical insere um novo registro em canonical_products e retorna o id gerado.
func insertCanonical(
	ctx context.Context,
	db *sqlx.DB,
	fingerprint []byte,
	title string,
	brandID *int64,
	priceBand *int,
	lowConfidence bool,
) (int64, error) {
	var id int64
	err := db.GetContext(
		ctx,
		&id,
		`INSERT INTO canonical_products (fingerprint, title_canonical, brand_id, price_band, low_confidence)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		fingerprint,
		title,
		brandID,
		priceBand,
		lowConfidence,
	)
	return id, err
}

// UpsertCanonical reutiliza um canonical existente (por fingerprint) ou insere um novo.
// Retorna (id, wasExisting, error) — wasExisting=true indica deduplicação (reuse de canonical existente).
//
// Regra de baixa confiança: itens sem brand_id (nil) são marcados como low_confidence=true.
// O UNIQUE index parcial em canonical_products(fingerprint) WHERE low_confidence=false
// garante que esses itens nunca colapsa com outros cross-marketplace.
func UpsertCanonical(
	ctx context.Context,
	db *sqlx.DB,
	fingerprint []byte,
	title string,
	brandID *int64,
	priceBand *int,
) (int64, bool, error) {
	lowConfidence := brandID == nil

	// Apenas produtos com brand confirmada participam do índice de dedup cross-marketplace.
	if !lowConfidence {
		existingID, err := findCanonicalByFingerprint(ctx, db, fingerprint)
		if err == nil {
			// Canonical já existe — reutiliza sem inserir nova linha.
			return existingID, true, nil
		}

		if !errors.Is(err, sql.ErrNoRows) {
			// Erro inesperado na busca.
			return 0, false, err
		}
	}

	// Não encontrado ou low_confidence: insere novo canonical.
	id, err := insertCanonical(ctx, db, fingerprint, title, brandID, priceBand, lowConfidence)
	return id, false, err
}

// LinkCatalogToCanonical atualiza catalog.canonical_product_id para o canonical dado.
// Opera sobre a linha identificada por catalogID.
func LinkCatalogToCanonical(ctx context.Context, db *sqlx.DB, catalogID, canonicalID int64) error {
	_, err := db.ExecContext(
		ctx,
		`UPDATE catalog SET canonical_product_id = $1 WHERE id = $2`,
		canonicalID,
		catalogID,
	)
	return err
}
