-- dispatches.product_id foi criado referenciando catalogvariant(id), mas o Composer/API
-- enviam sempre catalogproduct.id — causava FK violation (500) ao criar dispatch.
-- Reponta para catalogproduct e converte IDs antigos que eram variant → produto.

ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS dispatches_product_id_fkey;

-- Linhas gravadas como variant id → substituir pelo catalog_product_id correspondente
UPDATE dispatches d
SET product_id = v.catalog_product_id
FROM catalogvariant v
WHERE d.product_id IS NOT NULL
  AND d.product_id = v.id;

-- Referências que não batem em produto (variant apagado, dado inválido)
UPDATE dispatches
SET product_id = NULL
WHERE product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM catalogproduct p WHERE p.id = dispatches.product_id);

ALTER TABLE dispatches
    ADD CONSTRAINT dispatches_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES catalogproduct(id) ON DELETE SET NULL;
