package store

import (
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/base64"
	"fmt"
)

// genShortID gera um short_id alfanumérico de 10 chars (URL-safe).
func genShortID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:10]
}

// ---------------------------------------------------------------------------
// Pipeline canônico v2 — catalog table
// ---------------------------------------------------------------------------

// CatalogV2Item representa uma linha da tabela catalog (v2) para uso no pipeline.
type CatalogV2Item struct {
	ID           int64   `db:"id"`
	ShortID      string  `db:"short_id"`
	DedupKey     string  `db:"dedup_key"`
	SourceID     string  `db:"source_id"`
	Title        string  `db:"title"`
	PriceCurrent float64 `db:"price_current"`
	CanonicalURL string  `db:"canonical_url"`
	ImageURL     string  `db:"image_url"`
	ContentHash  string  `db:"content_hash"`
}

// CatalogV2UpsertParams reúne os campos necessários para um upsert em catalog.
type CatalogV2UpsertParams struct {
	DedupKey     string
	ShortID      string
	SourceID     string
	Title        string
	PriceCurrent float64
	CanonicalURL string
	ImageURL     string
}

// ContentHashV2 calcula o hash canônico do item para detecção de mudanças.
// Fórmula: sha1(title || price_current || image_url)
func ContentHashV2(title string, price float64, imageURL string) string {
	h := sha1.Sum([]byte(fmt.Sprintf("%s|%.4f|%s", title, price, imageURL)))
	return fmt.Sprintf("%x", h[:])
}

// DedupKeyV2 constrói a chave canônica de deduplicação.
// Formato: '{source}:{external_id}'
func DedupKeyV2(source, externalID string) string {
	return fmt.Sprintf("%s:%s", source, externalID)
}

// UpsertCatalogItem insere ou atualiza um item em catalog v2.
// Retorna o short_id do item (novo ou existente).
// Idempotente via ON CONFLICT (dedup_key) DO UPDATE.
func (s *SQLStore) UpsertCatalogItem(p CatalogV2UpsertParams) (string, error) {
	shortID := p.ShortID
	if shortID == "" {
		shortID = genShortID()
	}
	contentHash := ContentHashV2(p.Title, p.PriceCurrent, p.ImageURL)

	// Garante que source_id existe; usa 'unknown' como fallback seguro.
	_, err := s.db.Exec(`
		INSERT INTO catalog (
			dedup_key, short_id, source_id, title,
			price_current, canonical_url, image_url,
			content_hash, send_ready
		)
		SELECT $1, $2,
			COALESCE((SELECT id FROM sources WHERE id = $3), 'unknown'),
			$4, $5, $6, $7, $8, false
		ON CONFLICT (dedup_key) DO UPDATE SET
			price_current = EXCLUDED.price_current,
			content_hash  = EXCLUDED.content_hash,
			image_url     = EXCLUDED.image_url,
			updated_at    = now()
	`, p.DedupKey, shortID, p.SourceID, p.Title, p.PriceCurrent, p.CanonicalURL, p.ImageURL, contentHash)
	if err != nil {
		return "", err
	}

	// Lê o short_id real (pode diferir se houve conflito e a linha já existia).
	var actual string
	if err := s.db.Get(&actual, `SELECT short_id FROM catalog WHERE dedup_key = $1`, p.DedupKey); err != nil {
		return shortID, nil
	}
	return actual, nil
}

// GetCatalogItemByDedupKey retorna um item de catalog v2 pela chave de deduplicação.
func (s *SQLStore) GetCatalogItemByDedupKey(dedupKey string) (CatalogV2Item, bool, error) {
	var item CatalogV2Item
	err := s.db.Get(&item, `
		SELECT id, short_id, dedup_key, source_id, title,
		       price_current, canonical_url,
		       COALESCE(image_url, '') AS image_url,
		       content_hash
		FROM catalog WHERE dedup_key = $1 LIMIT 1
	`, dedupKey)
	if err == sql.ErrNoRows {
		return item, false, nil
	}
	return item, err == nil, err
}

// GetCatalogItemByURL retorna um item de catalog v2 pela URL canônica.
func (s *SQLStore) GetCatalogItemByURL(canonicalURL string) (CatalogV2Item, bool, error) {
	var item CatalogV2Item
	err := s.db.Get(&item, `
		SELECT id, short_id, dedup_key, source_id, title,
		       price_current, canonical_url,
		       COALESCE(image_url, '') AS image_url,
		       content_hash
		FROM catalog WHERE canonical_url = $1 LIMIT 1
	`, canonicalURL)
	if err == sql.ErrNoRows {
		return item, false, nil
	}
	return item, err == nil, err
}

// ListCatalogV2ForMatch carrega itens de catalog v2 para fuzzy match no pipeline.
// Ordena por id DESC para priorizar itens mais recentes.
func (s *SQLStore) ListCatalogV2ForMatch(limit int) ([]CatalogV2Item, error) {
	if limit <= 0 {
		limit = 10000
	}
	var out []CatalogV2Item
	err := s.db.Select(&out, `
		SELECT id, short_id, dedup_key, source_id, title,
		       price_current, canonical_url,
		       COALESCE(image_url, '') AS image_url,
		       content_hash
		FROM catalog
		ORDER BY id DESC
		LIMIT $1
	`, limit)
	return out, err
}
