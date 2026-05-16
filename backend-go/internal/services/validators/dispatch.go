// Package validators reúne validações tipadas usadas no pipeline de dispatch.
// Erros são sentinelas enumerados — caller pode comparar com errors.Is sem parsing de string.
package validators

import "errors"

// Erros sentinelas retornados por ValidateForDispatch.
// Caller deve gravar em dispatch_rejections audit table quando !ok.
var (
	// ErrNoOriginalPrice indica que o preço original está ausente ou não é maior que o preço atual.
	ErrNoOriginalPrice = errors.New("no_original_price")

	// ErrDiscountBelowMin indica que o desconto calculado está abaixo do mínimo exigido pelo canal.
	ErrDiscountBelowMin = errors.New("discount_below_min")

	// ErrDuplicateInWindow indica que o item já foi enviado nessa janela de deduplicação.
	ErrDuplicateInWindow = errors.New("duplicate_in_window")

	// ErrChannelPaused indica que o canal de envio está pausado e não aceita novos dispatches.
	ErrChannelPaused = errors.New("channel_paused")

	// ErrBrandMissing indica que o item não possui brand_id associado, obrigatório para o canal.
	ErrBrandMissing = errors.New("brand_missing")

	// ErrCatalogNotReady indica que o catalog_status não está em 'ready' ou 'enriching'.
	ErrCatalogNotReady = errors.New("catalog_not_ready")
)

// CatalogRow representa os campos de catalog necessários para a validação de dispatch.
// Mapeado diretamente da tabela catalog (schema v2 com dual-write window W2.A).
type CatalogRow struct {
	ID            int64
	Status        string   // catalog_status_t enum: pending | enriching | ready | sent | quarantined | archived
	QualityScore  float64
	DiscountPct   float64
	PriceOriginal *float64 // nil quando não há preço original cadastrado
	PriceCurrent  float64
	BrandID       *int64 // nil quando a marca ainda não foi classificada
}

// ChannelConfig contém a configuração do canal de envio usada na validação.
// Carregada do banco antes de chamar ValidateForDispatch.
type ChannelConfig struct {
	ID              int64
	Paused          bool
	MinDiscountPct  float64
	MinQualityScore float64
}

// ValidateForDispatch valida se um item de catalog está apto para ser enviado em um canal.
// Retorna (ok, reasons). Quando ok=false, reasons lista todos os motivos tipados.
// Caller (sender/dispatcher) deve gravar em dispatch_rejections audit table se !ok.
func ValidateForDispatch(item CatalogRow, channel ChannelConfig) (bool, []error) {
	var reasons []error

	reasons = validateCatalogStatus(item, reasons)
	reasons = validateOriginalPrice(item, reasons)
	reasons = validateDiscount(item, channel, reasons)
	reasons = validateQualityScore(item, channel, reasons)
	reasons = validateChannelActive(channel, reasons)
	reasons = validateBrand(item, reasons)

	return len(reasons) == 0, reasons
}

// validateCatalogStatus rejeita o item se o status não for 'ready' ou 'enriching'.
// Itens 'pending', 'sent', 'quarantined' e 'archived' não devem ser re-despachados.
func validateCatalogStatus(item CatalogRow, reasons []error) []error {
	if item.Status != "ready" && item.Status != "enriching" {
		reasons = append(reasons, ErrCatalogNotReady)
	}
	return reasons
}

// validateOriginalPrice rejeita o item quando não há preço original ou o desconto não existe.
// Um preço original igual ou menor que o atual é inválido (sem desconto real).
func validateOriginalPrice(item CatalogRow, reasons []error) []error {
	if item.PriceOriginal == nil || *item.PriceOriginal <= item.PriceCurrent {
		reasons = append(reasons, ErrNoOriginalPrice)
	}
	return reasons
}

// validateDiscount rejeita o item quando o desconto calculado está abaixo do mínimo do canal.
func validateDiscount(item CatalogRow, channel ChannelConfig, reasons []error) []error {
	if item.DiscountPct < channel.MinDiscountPct {
		reasons = append(reasons, ErrDiscountBelowMin)
	}
	return reasons
}

// validateQualityScore rejeita o item quando o quality score está abaixo do mínimo do canal.
func validateQualityScore(item CatalogRow, channel ChannelConfig, reasons []error) []error {
	if item.QualityScore < channel.MinQualityScore {
		reasons = append(reasons, ErrDiscountBelowMin)
	}
	return reasons
}

// validateChannelActive rejeita o dispatch quando o canal está pausado.
func validateChannelActive(channel ChannelConfig, reasons []error) []error {
	if channel.Paused {
		reasons = append(reasons, ErrChannelPaused)
	}
	return reasons
}

// validateBrand rejeita o item quando brand_id é nil — obrigatório para rastreabilidade.
func validateBrand(item CatalogRow, reasons []error) []error {
	if item.BrandID == nil {
		reasons = append(reasons, ErrBrandMissing)
	}
	return reasons
}
