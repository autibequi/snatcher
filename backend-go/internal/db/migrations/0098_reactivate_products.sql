-- migrate:up
-- Reativa produtos que foram inativados prematuramente por buscas por keyword.
-- O pipeline agora não incrementa falhas em buscas — só via URL direta.
UPDATE catalogproduct
SET inactive = FALSE, consecutive_failures = 0
WHERE inactive = TRUE;

-- migrate:down
-- noop
