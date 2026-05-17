-- Reverter migração de brand_keywords → taxonomy_node
-- Remove apenas nós raiz (parent_id IS NULL) de kind='brand' cujos slugs existem em brand_keywords
DELETE FROM taxonomy_node
WHERE kind = 'brand'
  AND parent_id IS NULL
  AND slug IN (SELECT DISTINCT brand_slug FROM brand_keywords);

-- Reverter migração de category_keywords → taxonomy_node
-- Remove apenas nós raiz (parent_id IS NULL) de kind='category' cujos slugs existem em category_keywords
DELETE FROM taxonomy_node
WHERE kind = 'category'
  AND parent_id IS NULL
  AND slug IN (SELECT DISTINCT category_slug FROM category_keywords);
