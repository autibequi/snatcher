package repositories

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
	DedupKey      string
	ShortID       string
	SourceID      string
	Title         string
	PriceCurrent  float64
	PriceOriginal float64 // 0 = sem preço original (sem desconto calculável)
	CanonicalURL  string
	ImageURL      string
	Brand         string // marca do produto (opcional)
}

// computeQualityScore calcula um score básico 0–1 baseado nos atributos do produto.
// Critérios: imagem (+0.3), desconto real (+até 0.4), preço válido (+0.2), título (+0.1).
func computeQualityScore(p CatalogV2UpsertParams) float64 {
	score := 0.0
	if p.ImageURL != "" {
		score += 0.30
	}
	if p.PriceCurrent > 0 {
		score += 0.20
	}
	if p.Title != "" && len(p.Title) > 5 {
		score += 0.10
	}
	if p.PriceOriginal > p.PriceCurrent && p.PriceCurrent > 0 {
		discount := (p.PriceOriginal - p.PriceCurrent) / p.PriceOriginal
		if discount > 0.40 {
			discount = 0.40
		}
		score += discount
	}
	return score
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

// catalogStatusFromSendReady deriva o catalog_status_t a partir de send_ready + quality_score.
// Mapeamento dual-write (window 7d até DROP COLUMN send_ready):
//   - send_ready=true  AND quality_score >= 0.5 → 'ready'
//   - send_ready=true  AND quality_score < 0.5  → 'enriching'
//   - send_ready=false                           → 'pending'
func catalogStatusFromSendReady(sendReady bool, qualityScore float64) string {
	if !sendReady {
		return "pending"
	}
	if qualityScore >= 0.5 {
		return "ready"
	}
	return "enriching"
}

// UpsertCatalogItem insere ou atualiza um item em catalog v2.
// Retorna o short_id do item (novo ou existente).
// Idempotente via ON CONFLICT (dedup_key) DO UPDATE.
// Durante o dual-write window (W2.A), escreve em send_ready E catalog_status simultaneamente.
func (s *SQLStore) UpsertCatalogItem(p CatalogV2UpsertParams) (string, error) {
	shortID := p.ShortID
	if shortID == "" {
		shortID = genShortID()
	}
	contentHash := ContentHashV2(p.Title, p.PriceCurrent, p.ImageURL)
	qualityScore := computeQualityScore(p)
	// send_ready exige qualidade mínima E uma das duas: desconto real (price_original >
	// price_current) OU "achadinho" — produto barato (preço baixo absoluto) que gera clique
	// por impulso mesmo sem desconto verificável. Antes só desconto era aceito, o que zerava
	// a fila quando o catálogo vinha sem price_original.
	const achadinhoMaxPriceBRL = 80.0
	hasRealDiscount := p.PriceOriginal > p.PriceCurrent && p.PriceCurrent > 0
	isAchadinho := p.PriceCurrent > 0 && p.PriceCurrent <= achadinhoMaxPriceBRL
	sendReady := qualityScore >= 0.40 && (hasRealDiscount || isAchadinho)

	// Dual-write: catalog_status é derivado de send_ready + quality_score.
	catalogStatus := catalogStatusFromSendReady(sendReady, qualityScore)

	// Garante que source_id existe; usa 'unknown' como fallback seguro.
	_, err := s.db.Exec(`
		INSERT INTO catalog (
			dedup_key, short_id, source_id, title,
			price_current, price_original, canonical_url, image_url,
			content_hash, quality_score, send_ready, brand,
			catalog_status
		)
		SELECT $1, $2,
			COALESCE((SELECT id FROM sources WHERE id = $3), 'unknown'),
			$4, $5, $6, $7, $8, $9, $10, $11,
			COALESCE(NULLIF($12,''), NULLIF((classify_catalog_brand($4)).slug, '')),
			$13::catalog_status_t
		ON CONFLICT (dedup_key) DO UPDATE SET
			price_current  = EXCLUDED.price_current,
			price_original = EXCLUDED.price_original,
			content_hash   = EXCLUDED.content_hash,
			image_url      = EXCLUDED.image_url,
			quality_score  = EXCLUDED.quality_score,
			send_ready     = EXCLUDED.send_ready,
			send_ready_at  = CASE WHEN EXCLUDED.send_ready AND NOT catalog.send_ready THEN now() ELSE catalog.send_ready_at END,
			brand          = COALESCE(EXCLUDED.brand, catalog.brand),
			catalog_status = EXCLUDED.catalog_status
	`, p.DedupKey, shortID, p.SourceID, p.Title, p.PriceCurrent, p.PriceOriginal, p.CanonicalURL, p.ImageURL, contentHash, qualityScore, sendReady, p.Brand, catalogStatus)
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
