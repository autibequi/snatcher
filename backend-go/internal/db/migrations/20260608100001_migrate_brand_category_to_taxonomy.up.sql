-- Migrar brand_keywords → taxonomy_node (kind='brand')
-- confidence_pct=80: sinaliza que estes nós vieram de heurística ILIKE, não de LLM validado
-- parent_id omitido: raiz (NULL). Evita inferência de NULL como text no SELECT DISTINCT.
INSERT INTO taxonomy_node (slug, name_pt, kind, confidence_pct)
SELECT DISTINCT
    bk.brand_slug                                   AS slug,
    bk.brand_display                                AS name_pt,
    'brand'                                         AS kind,
    80                                              AS confidence_pct
FROM brand_keywords bk
WHERE bk.active = true
  AND NOT EXISTS (
    SELECT 1 FROM taxonomy_node tn
    WHERE tn.slug = bk.brand_slug
      AND tn.kind = 'brand'
      AND tn.parent_id IS NULL
  );

-- Migrar category_keywords → taxonomy_node (kind='category')
-- name_pt: category_slug com hífens → espaços, title case
-- confidence_pct=80: sinaliza que estes nós vieram de heurística ILIKE, não de LLM validado
INSERT INTO taxonomy_node (slug, name_pt, kind, confidence_pct)
SELECT DISTINCT
    ck.category_slug                                    AS slug,
    initcap(replace(ck.category_slug, '-', ' '))        AS name_pt,
    'category'                                          AS kind,
    80                                                  AS confidence_pct
FROM category_keywords ck
WHERE ck.active = true
  AND NOT EXISTS (
    SELECT 1 FROM taxonomy_node tn
    WHERE tn.slug = ck.category_slug
      AND tn.kind = 'category'
      AND tn.parent_id IS NULL
  );
