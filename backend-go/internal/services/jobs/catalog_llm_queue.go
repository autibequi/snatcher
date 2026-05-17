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

// getTaxonomyThreshold lê min_taxonomy_confidence de tunable_parameters com fallback 0.70.
// Nunca retorna erro — em caso de falha usa o default seguro.
func getTaxonomyThreshold(ctx context.Context, db *sqlx.DB) float64 {
	const defaultThreshold = 0.70
	var v float64
	err := db.GetContext(ctx, &v, `SELECT get_param('min_taxonomy_confidence','global',NULL)`)
	if err != nil || v <= 0 {
		return defaultThreshold
	}
	return v
}

// enqueueIfLowConfidence verifica a confidence de classificacao para um catalog_id e,
// se abaixo do threshold, insere em catalog_llm_queue com human_correction=false.
// Idempotente: ON CONFLICT DO UPDATE preserva status se ja estiver em processing.
func enqueueIfLowConfidence(ctx context.Context, db *sqlx.DB, catalogID int64, title string, threshold float64) error {
	type taxonomyMatch struct {
		Slug       string  `db:"slug"`
		Confidence float64 `db:"confidence"`
	}

	// Chama classify_catalog_brand (retorna taxonomy_match composto)
	var brandMatch taxonomyMatch
	if err := db.QueryRowxContext(ctx,
		`SELECT (classify_catalog_brand($1)).slug AS slug, (classify_catalog_brand($1)).confidence AS confidence`,
		title,
	).Scan(&brandMatch.Slug, &brandMatch.Confidence); err != nil {
		return fmt.Errorf("classify_catalog_brand: %w", err)
	}

	// Chama classify_catalog_category (retorna taxonomy_match composto)
	var catMatch taxonomyMatch
	if err := db.QueryRowxContext(ctx,
		`SELECT (classify_catalog_category($1)).slug AS slug, (classify_catalog_category($1)).confidence AS confidence`,
		title,
	).Scan(&catMatch.Slug, &catMatch.Confidence); err != nil {
		return fmt.Errorf("classify_catalog_category: %w", err)
	}

	brandLow := brandMatch.Confidence < threshold
	catLow := catMatch.Confidence < threshold

	if !brandLow && !catLow {
		// Ambos acima do threshold — nao enfileirar
		return nil
	}

	// Monta reason descritivo
	reason := fmt.Sprintf("low_taxonomy_confidence: brand=%.2f cat=%.2f threshold=%.2f",
		brandMatch.Confidence, catMatch.Confidence, threshold)

	_, err := db.ExecContext(ctx, `
		INSERT INTO catalog_llm_queue (catalog_id, reason, human_correction, status, enqueued_at)
		VALUES ($1, $2, false, 'pending', now())
		ON CONFLICT (catalog_id) DO UPDATE SET
			reason       = EXCLUDED.reason,
			human_correction = false,
			enqueued_at  = CASE WHEN catalog_llm_queue.status = 'processing'
			                    THEN catalog_llm_queue.enqueued_at
			                    ELSE now() END,
			status       = CASE WHEN catalog_llm_queue.status = 'processing'
			                    THEN catalog_llm_queue.status
			                    ELSE 'pending' END
	`, catalogID, reason)
	if err != nil {
		return fmt.Errorf("enqueue catalog %d: %w", catalogID, err)
	}

	slog.Info("catalog_llm_queue: enfileirado por baixa confianca",
		"catalog_id", catalogID,
		"brand_confidence", brandMatch.Confidence,
		"cat_confidence", catMatch.Confidence,
		"threshold", threshold,
	)
	return nil
}

// isValidTaxonomySlug restringe slugs a [a-z0-9] e hífens (não dobrados, sem borda), 2–48 runes.
// Evita gravar pontuação vinda do LLM (ex.: ",", ":") em catalog / product_brands.
func isValidTaxonomySlug(s string) bool {
	const minLen, maxLen = 2, 48
	if s == "" {
		return false
	}
	runes := []rune(s)
	if len(runes) < minLen || len(runes) > maxLen {
		return false
	}
	prevHyphen := false
	for i, r := range runes {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			prevHyphen = false
		case r == '-':
			if i == 0 || i == len(runes)-1 || prevHyphen {
				return false
			}
			prevHyphen = true
		default:
			return false
		}
	}
	return true
}

// catalogRowCompleteForCatalogEntry exige slug de marca, FK em product_brands e categoria — alinhado ao trigger trg_catalog_llm_queue_sync.
func catalogRowCompleteForCatalogEntry(brand sql.NullString, brandID sql.NullInt64, catID sql.NullInt64) bool {
	if !brand.Valid || strings.TrimSpace(brand.String) == "" {
		return false
	}
	if !brandID.Valid || brandID.Int64 <= 0 {
		return false
	}
	if !catID.Valid || catID.Int64 <= 0 {
		return false
	}
	return true
}

// RunCatalogLLMQueueOnce reivindica um item pending da catalog_llm_queue, tenta eurística no catálogo
// e, se ainda faltar marca ou categoria, chama o LLM (JSON) para sugerir slugs válidos.
// Sucesso: trigger em catalog remove a linha da fila quando brand, brand_id e category_id estão preenchidos.
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
	// 1. Tenta classify_catalog_category(title) — heurística por palavras no título.
	// 2. Fallback: se brand foi resolvida mas categoria não, usa default_category_slug
	//    da brand_keywords (ex: brand=nike → esporte, brand=samsung → eletronico).
	if _, err := db.ExecContext(ctx, `
		WITH x AS (
			SELECT c.id, NULLIF(bm.slug, '') AS bslug,
				COALESCE(
					CASE WHEN NULLIF(bm.slug, '') IS NOT NULL THEN
						(SELECT cat.id FROM categories cat
						 WHERE cat.slug = NULLIF(cm.slug, '') LIMIT 1)
					END,
					CASE WHEN NULLIF(bm.slug, '') IS NOT NULL THEN
						classify_category_from_brand(NULLIF(bm.slug, ''))
					END
				) AS cid
			FROM catalog c
			CROSS JOIN LATERAL (
				SELECT (classify_catalog_brand(c.title)).slug AS slug
			) bm
			CROSS JOIN LATERAL (
				SELECT (classify_catalog_category(c.title, COALESCE(c.source_id::text, ''))).slug AS slug
			) cm
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
	var brandID sql.NullInt64
	var catID sql.NullInt64
	var title string
	var sourceID sql.NullString
	if err := db.QueryRowxContext(ctx,
		`SELECT brand, brand_id, category_id, COALESCE(title,''), source_id::text FROM catalog WHERE id = $1`,
		catalogID,
	).Scan(&brand, &brandID, &catID, &title, &sourceID); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "ler catalog: "+truncateErr(err.Error()))
		return out, err
	}
	title = strings.TrimSpace(title)

	if catalogRowCompleteForCatalogEntry(brand, brandID, catID) {
		// Heuristica resolveu marca+categoria. Verificar confidence das funcoes v2:
		// se abaixo do threshold, re-enfileira para validacao LLM mesmo com match.
		threshold := getTaxonomyThreshold(ctx, db)
		if title != "" {
			if enqErr := enqueueIfLowConfidence(ctx, db, catalogID, title, threshold); enqErr != nil {
				slog.Warn("catalog_llm_queue: falha ao verificar confidence pos-heuristica",
					"catalog_id", catalogID, "err", enqErr)
				// Nao aborta o fluxo — item foi resolvido pela heuristica
			}
		}
		out["processed"] = true
		out["catalog_id"] = catalogID
		out["mode"] = "heuristic"
		out["message"] = "resolvido só com keywords (sem LLM)"
		return out, nil
	}

	cli := llmFactory()
	if cli == nil {
		_ = markQueueLLMRequeuePending(ctx, db, catalogID, "LLM não configurado — mantendo pending (Settings → LLM / API key)")
		out["message"] = "LLM não configurado; item voltou para pending"
		return out, nil
	}

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
		MaxTokens:   1500, // anterior 220 — insuficiente pra modelos com reasoning interno (DeepSeek-R1, QwQ, etc.)
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
	if !isValidTaxonomySlug(bslug) {
		_ = markQueueLLMError(ctx, db, catalogID, fmt.Sprintf("LLM devolveu brand_slug inválido (só a-z, 0-9, hífen, 2–48 chars): %q", bslug))
		out["message"] = "brand_slug inválido"
		return out, nil
	}
	if !isValidTaxonomySlug(cslug) {
		_ = markQueueLLMError(ctx, db, catalogID, fmt.Sprintf("LLM devolveu category_slug inválido: %q", cslug))
		out["message"] = "category_slug inválido (formato)"
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

	if err := db.QueryRowxContext(ctx, `SELECT brand, brand_id, category_id FROM catalog WHERE id = $1`, catalogID).Scan(&brand, &brandID, &catID); err != nil {
		_ = markQueueLLMError(ctx, db, catalogID, "pós-LLM ler catalog: "+truncateErr(err.Error()))
		return out, err
	}
	if !catalogRowCompleteForCatalogEntry(brand, brandID, catID) {
		_ = markQueueLLMRequeuePending(ctx, db, catalogID, "pós-LLM: marca/categoria/brand_id ainda incompletos após UPDATE")
		out["message"] = "UPDATE aplicado mas linha incompleta; re-enfileirado como pending"
		return out, nil
	}

	out["processed"] = true
	out["catalog_id"] = catalogID
	out["mode"] = "llm"
	out["message"] = fmt.Sprintf("brand=%s category=%s", bslug, cslug)
	slog.Info("catalog_llm_queue: item processado via LLM", "catalog_id", catalogID, "brand", bslug, "category_slug", cslug)

	// Feedback loop: registra brand_slug em brand_keywords e re-roda heurística
	// nos itens pendentes da fila. Se o novo dado resolve outros itens, eles saem
	// da fila sem gastar tokens LLM adicionais.
	go sweepQueueWithNewKeyword(context.Background(), db, bslug, brandRowID)

	return out, nil
}

// sweepQueueWithNewKeyword insere o brand_slug em brand_keywords (pra heurística aprender)
// e re-roda a heurística em todos os itens pendentes da fila. Itens que agora ficarem
// com brand+brand_id+category_id preenchidos saem da fila via trigger automático.
// Rodado em goroutine pra não bloquear o worker.
func sweepQueueWithNewKeyword(ctx context.Context, db *sqlx.DB, brandSlug string, brandID int64) {
	display := strings.Title(strings.ReplaceAll(brandSlug, "-", " "))

	// 1. Registra o novo brand em brand_keywords para que a heurística passe a conhecê-lo.
	//    ON CONFLICT DO NOTHING garante idempotência — não sobrescreve patterns manuais.
	if _, err := db.ExecContext(ctx, `
		INSERT INTO brand_keywords (brand_slug, brand_display, pattern, source, weight)
		VALUES ($1, $2, $3, 'llm_learned', 110)
		ON CONFLICT (brand_slug, pattern) DO NOTHING
	`, brandSlug, display, "%"+brandSlug+"%"); err != nil {
		slog.Warn("sweepQueue: falha ao inserir brand_keyword", "brand", brandSlug, "err", err)
		// Não aborta — sweep ainda pode resolver via brand_id direto
	}

	// 2. Para cada item pendente, re-aplica heurística completa (brand + category + fallback).
	//    Cobre tanto reason=no_brand_keyword_match quanto no_category_keyword_match,
	//    já que o novo keyword pode resolver a cadeia inteira.
	//
	//    Nota: a forma antiga usava `LEFT JOIN product_brands pb ON pb.slug = ...c.title...`
	//    diretamente na cláusula FROM do UPDATE, mas o Postgres não expõe a tabela alvo
	//    `c` para JOINs paralelos no FROM (somente via correlação WHERE) — quebrava com
	//    "invalid reference to FROM-clause entry for table c". A CTE abaixo pré-computa
	//    bslug/cslug por linha e bonus: chama classify_catalog_brand 1x ao invés de 3x.
	res, err := db.ExecContext(ctx, `
		WITH classified AS (
			SELECT c.id,
			       NULLIF((classify_catalog_brand(c.title)).slug, '') AS bslug,
			       NULLIF((classify_catalog_category(c.title, COALESCE(c.source_id::text, ''))).slug, '') AS cslug
			FROM   catalog c
			JOIN   catalog_llm_queue q ON q.catalog_id = c.id
			WHERE  q.status = 'pending'
			  AND  (c.brand IS NULL OR c.category_id IS NULL)
			  AND  c.title IS NOT NULL AND btrim(c.title) <> ''
		)
		UPDATE catalog c
		SET    brand = COALESCE(x.bslug, c.brand),
		       brand_id = COALESCE(pb.id, c.brand_id),
		       category_id = COALESCE(
		           (SELECT cat.id FROM categories cat WHERE cat.slug = x.cslug LIMIT 1),
		           classify_category_from_brand(COALESCE(x.bslug, c.brand)),
		           c.category_id
		       ),
		       updated_at = now()
		FROM   classified x
		LEFT JOIN product_brands pb ON pb.slug = x.bslug
		WHERE  c.id = x.id
	`)
	if err != nil {
		slog.Warn("sweepQueue: erro no re-sweep de fila", "brand", brandSlug, "err", err)
		return
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		slog.Info("sweepQueue: heurística resolveu itens adicionais", "brand", brandSlug, "resolved", n)
	}
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

// markQueueLLMRequeuePending libera claim `processing` → pending para nova tentativa (ex.: LLM off, dados inconsistentes).
func markQueueLLMRequeuePending(ctx context.Context, db *sqlx.DB, catalogID int64, msg string) error {
	msg = truncateErr(msg)
	_, err := db.ExecContext(ctx, `
		UPDATE catalog_llm_queue
		SET status = 'pending', last_error = $2, processed_at = NULL
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
