-- Reseta send_ready para FALSE em produtos sem desconto verificável.
-- Resolve: produtos com price_original=0 ou discount_pct=0 estavam marcados
-- como send_ready=true (quality_score >= 0.40 era o único critério).
-- O sender rejeitaria de qualquer forma (renderTemplateBodyV2 exige desconto real),
-- mas a fila de envio ficaria suja e geraria muitos status=invalid.

UPDATE catalog
SET send_ready    = false,
    catalog_status = 'pending'
WHERE send_ready = true
  AND (
      price_original IS NULL
      OR price_original = 0
      OR price_original <= price_current
      OR discount_pct IS NULL
      OR discount_pct <= 0
  );
