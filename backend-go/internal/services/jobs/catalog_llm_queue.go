package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"snatcher/backendv2/internal/services/llm"

	"github.com/jmoiron/sqlx"
)

// RunCatalogLLMQueueOnce reivindica um item pending da catalog_llm_queue, tenta eurística no catálogo
// e, se ainda faltar marca ou categoria, chama o LLM (JSON) para sugerir slugs válidos.
// Sucesso: trigger em catalog remove a linha da fila quando brand+category_id estão preenchidos.
// Retorno típico: {"processed":true|false,"catalog_id":N,"mode":"heuristic"|"llm"|"none","message":"..."}
func RunCatalogLLMQueueOnce(ctx context.Context, db *sqlx.DB, llmFactory func() llm.Client) (map[string]any, error) {
	out := map[string]any{"processed": false}

	// Libera claims antigos (crash / timeout) para não bloquear a fila indefinidamente.
	if _, err := db.ExecContext(ctx, `
		UPDATE catalog_llm_queue
		SET status = 'pending', last_error = NULL, processed_at = NULL
		WHERE status = 'processing' AND enqueued_at < now() - interval '6 hours'
	`); err != nil {
		slog.Warn("catalog_llm_queue: stall reset falhou", "err", err)
	}

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer func() { _ = tx.Rollback() }()

	var catalogID int64
	err = tx.QueryRowxContext(ctx, `
		WITH cte AS (
			SELECT catalog_id FROM catalog_llm_queue
			WHERE status = 'pending'
			ORDER BY enqueued_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE catalog_llm_queue q
		SET status = 'processing', last_error = NULL
		FROM cte
		WHERE q.catalog_id = cte.catalog_id
		RETURNING q.catalog_id
	`).Scan(&catalogID)
	if err == sql.ErrNoRows {
		_ = tx.Commit()
		out["message"] = "fila vazia (nenhum pending disponível)"
		return out, nil
	}
	if err != nil {
		return out, err
	}
	if err := tx.Commit(); err != nil {
		return out, err
	}

	// --- Eurística só neste ID (keywords podem ter mudado desde o enqueue) ---
	if _, err := db.ExecContext(ctx, `
		WITH x AS (
			SELECT c.id, b.bslug,
				CASE WHEN b.bslug IS NOT NULL
					THEN classify_catalog_category(c.title, COALESCE(c.source_id::text, ''))
					ELSE NULL END AS cid
			FROM catalog c
			CROSS JOIN LATERAL (SELECT classify_catalog_brand(c.title) AS bslug) b
			WHERE c.id = $1 AND c.title IS NOT NULL AND btrim(c.title) <> ''
		)
		UPDATE catalog c SET
			brand = x.bslug,
			brand_id = pb.id,
			category_id = x.cid,
			updated_at = now()
		FROM x
		LEFT JOIN product_brands pb ON pb.slug = x.bslug
		WHERE c.id = x.id
	`, catalogID); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "eurística: "+truncateErr(err.Error()))
		return out, err
	}

	var brand sql.NullString
	var catID sql.NullInt64
	if err := db.QueryRowxContext(ctx, `SELECT brand, category_id FROM catalog WHERE id = $1`, catalogID).Scan(&brand, &catID); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "ler catalog: "+truncateErr(err.Error()))
		return out, err
	}
	if brand.Valid && strings.TrimSpace(brand.String) != "" && catID.Valid && catID.Int64 > 0 {
		out["processed"] = true
		out["catalog_id"] = catalogID
		out["mode"] = "heuristic"
		out["message"] = "resolvido só com keywords (sem LLM)"
		return out, nil
	}

	cli := llmFactory()
	if cli == nil {
		_ = markQueueLLMError(ctx, db, catalogID, "LLM não configurado (Settings → LLM / API key)")
		out["message"] = "LLM não configurado"
		return out, nil
	}

	var title string
	var sourceID sql.NullString
	if err := db.QueryRowxContext(ctx, `SELECT title, source_id::text FROM catalog WHERE id = $1`, catalogID).Scan(&title, &sourceID); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "ler título: "+truncateErr(err.Error()))
		return out, err
	}
	title = strings.TrimSpace(title)
	if len(title) > 500 {
		title = title[:500] + "…"
	}

	catSlugs, err := loadCategorySlugs(ctx, db, 120)
	if err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "listar categorias: "+truncateErr(err.Error()))
		return out, err
	}
	if len(catSlugs) == 0 {
		_ = markQueueLLMError(ctx, db, catalogID, "nenhuma categoria no banco — impossível classificar")
		out["message"] = "sem categorias"
		return out, nil
	}
	brandSlugs, err := loadBrandSlugs(ctx, db, 150)
	if err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "listar marcas: "+truncateErr(err.Error()))
		return out, err
	}

	src := ""
	if sourceID.Valid {
		src = strings.TrimSpace(sourceID.String)
	}
	prompt := fmt.Sprintf(`Classifique o produto de e-commerce (Brasil).
Responda APENAS um objeto JSON com as chaves "brand_slug" e "category_slug" (strings em minúsculas, ASCII, hífens no lugar de espaços).
A category_slug DEVE ser exatamente um destes valores: [%s]
A brand_slug DEVE ser um destes slugs de marca já existentes, se couber; caso contrário invente um slug curto e estável (só letras minúsculas, números e hífen): [%s]
Título: %q
Origem/source (pode ser vazio): %q`,
		strings.Join(quoteSlugs(catSlugs), ", "),
		strings.Join(quoteSlugs(brandSlugs), ", "),
		title, src,
	)

	llmCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	raw, err := cli.Complete(llmCtx, prompt, llm.Options{
		JSONMode:    true,
		MaxTokens:   220,
		Temperature: 0.15,
		Operation:   "catalog_llm_queue",
	})
	if err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "LLM: "+truncateErr(err.Error()))
		out["message"] = err.Error()
		return out, nil
	}
	raw = strings.TrimSpace(llm.ExtractJSONObject(raw))
	var parsed struct {
		BrandSlug      string `json:"brand_slug"`
		CategorySlug   string `json:"category_slug"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "JSON inválido do LLM: "+truncateErr(err.Error()))
		out["message"] = "JSON inválido"
		return out, nil
	}
	bslug := strings.ToLower(strings.TrimSpace(parsed.BrandSlug))
	cslug := strings.ToLower(strings.TrimSpace(parsed.CategorySlug))
	if bslug == "" || cslug == "" {
		_ = markQueueLLMError(ctx, db, catalogID, "LLM devolveu brand_slug ou category_slug vazio")
		out["message"] = "slugs vazios"
		return out, nil
	}

	var catRowID int64
	err = db.QueryRowxContext(ctx, `SELECT id FROM categories WHERE slug = $1 LIMIT 1`, cslug).Scan(&catRowID)
	if err == sql.ErrNoRows || catRowID <= 0 {
		_ = markQueueLLMError(ctx, db, catalogID, fmt.Sprintf("categoria inexistente slug=%q", cslug))
		out["message"] = "category_slug inválido"
		return out, nil
	}
	if err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "lookup categoria: "+truncateErr(err.Error()))
		return out, err
	}

	display := strings.TrimSpace(strings.ReplaceAll(bslug, "-", " "))
	if display == "" {
		display = bslug
	}
	var brandRowID int64
	err = db.QueryRowxContext(ctx, `
		INSERT INTO product_brands (slug, display_name) VALUES ($1, $2)
		ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
		RETURNING id
	`, bslug, display).Scan(&brandRowID)
	if err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "upsert marca: "+truncateErr(err.Error()))
		return out, err
	}

	if _, err := db.ExecContext(ctx, `
		UPDATE catalog SET brand = $1, brand_id = $2, category_id = $3, updated_at = now() WHERE id = $4
	`, bslug, brandRowID, catRowID, catalogID); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "UPDATE catalog: "+truncateErr(err.Error()))
		return out, err
	}

	out["processed"] = true
	out["catalog_id"] = catalogID
	out["mode"] = "llm"
	out["message"] = fmt.Sprintf("brand=%s category=%s", bslug, cslug)
	slog.Info("catalog_llm_queue: item processado via LLM", "catalog_id", catalogID, "brand", bslug, "category_slug", cslug)
	return out, nil
}

func markQueueLLMError(ctx context.Context, db *sqlx.DB, catalogID int64, msg string) error {
	msg = truncateErr(msg)
	_, err := db.ExecContext(ctx, `
		UPDATE catalog_llm_queue
		SET status = 'error', last_error = $2, processed_at = now()
		WHERE catalog_id = $1 AND status = 'processing'
	`, catalogID, msg)
	return err
}

func truncateErr(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 900 {
		return s[:900] + "…"
	}
	return s
}

func loadCategorySlugs(ctx context.Context, db *sqlx.DB, limit int) ([]string, error) {
	var slugs []string
	err := db.SelectContext(ctx, &slugs, `SELECT slug FROM categories ORDER BY slug LIMIT $1`, limit)
	return slugs, err
}

func loadBrandSlugs(ctx context.Context, db *sqlx.DB, limit int) ([]string, error) {
	var slugs []string
	err := db.SelectContext(ctx, &slugs, `SELECT slug FROM product_brands ORDER BY slug LIMIT $1`, limit)
	return slugs, err
}

func quoteSlugs(slugs []string) []string {
	out := make([]string, 0, len(slugs))
	for _, s := range slugs {
		out = append(out, fmt.Sprintf("%q", s))
	}
	return out
}
