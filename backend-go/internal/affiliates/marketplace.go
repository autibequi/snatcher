package affiliates

import (
	"net/url"
	"strings"
)

// IDs canônicos gravados em affiliate_programs.marketplace e usados em toda a stack.
// Aliases (amz, ml, …) normalizam para estes valores — única fonte de verdade.
const (
	MarketplaceAmazon       = "amazon"
	MarketplaceMercadoLivre = "mercadolivre"
	MarketplaceMagalu       = "magalu"
	MarketplaceShopee       = "shopee"
	MarketplaceAliExpress   = "aliexpress"
	MarketplaceKabum        = "kabum"
	MarketplaceAmericanas   = "americanas"
	MarketplaceCasasBahia   = "casasbahia"
)

// CanonicalMarketplaceIDs lista estável para validação e OpenAPI.
var CanonicalMarketplaceIDs = []string{
	MarketplaceAmazon,
	MarketplaceMercadoLivre,
	MarketplaceMagalu,
	MarketplaceShopee,
	MarketplaceAliExpress,
	MarketplaceKabum,
	MarketplaceAmericanas,
	MarketplaceCasasBahia,
}

// marketplaceAliases mapeia rótulos do crawler/UI antiga → ID canônico.
var marketplaceAliases = map[string]string{
	"amz":             MarketplaceAmazon,
	"amazon.com":      MarketplaceAmazon,
	"amazon.com.br":   MarketplaceAmazon,
	"ml":              MarketplaceMercadoLivre,
	"mercado_livre":   MarketplaceMercadoLivre,
	"mercado livre":   MarketplaceMercadoLivre,
	"magazine_luiza":  MarketplaceMagalu,
	"magazineluiza":   MarketplaceMagalu,
	"ali":             MarketplaceAliExpress,
	"americanas.com":  MarketplaceAmericanas,
	"casas_bahia":     MarketplaceCasasBahia,
	"casas bahia":     MarketplaceCasasBahia,
}

// IsCanonicalMarketplaceID retorna true se s já é um dos IDs enum (lowercase).
func IsCanonicalMarketplaceID(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, id := range CanonicalMarketplaceIDs {
		if s == id {
			return true
		}
	}
	return false
}

// CanonicalAffiliateMarketplace normaliza aliases e nomes legados para um ID canônico.
// Entrada desconhecida → "" (não propagar string arbitrária como marketplace).
func CanonicalAffiliateMarketplace(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	if id, ok := marketplaceAliases[s]; ok {
		return id
	}
	if IsCanonicalMarketplaceID(s) {
		return s
	}
	return ""
}

// ValidCanonicalMarketplace indica se o valor resolve para um marketplace suportado.
func ValidCanonicalMarketplace(s string) bool {
	return CanonicalAffiliateMarketplace(s) != ""
}

// MarketplaceDef descreve uma linha da UI / contrato API — gerado só a partir dos const acima.
type MarketplaceDef struct {
	ID              string `json:"id"`
	Label           string `json:"label"`
	CredentialField string `json:"credential_field"`
	Placeholder     string `json:"placeholder"`
	Hint            string `json:"hint"`
	TestProductURL  string `json:"test_product_url"`
}

// MarketplaceCatalog retorna o catálogo para a página Afiliados (uma linha por enum).
func MarketplaceCatalog() []MarketplaceDef {
	return []MarketplaceDef{
		{ID: MarketplaceAmazon, Label: "Amazon Associates", CredentialField: "tag", Placeholder: "snatcher-20",
			Hint: "Amazon Associates tracking tag", TestProductURL: "https://www.amazon.com.br/dp/B08N5WRWNW"},
		{ID: MarketplaceMercadoLivre, Label: "Mercado Livre", CredentialField: "affiliate_id", Placeholder: "1234567",
			Hint: "ID do afiliado ML", TestProductURL: "https://produto.mercadolivre.com.br/MLB-2176938247"},
		{ID: MarketplaceMagalu, Label: "Magalu Parceiro", CredentialField: "affiliate_id", Placeholder: "SEU_ID",
			Hint: "ID do parceiro Magalu", TestProductURL: "https://www.magazineluiza.com.br/produto/example"},
		{ID: MarketplaceShopee, Label: "Shopee Afiliados", CredentialField: "affiliate_id", Placeholder: "SEU_ID",
			Hint: "ID de afiliado Shopee", TestProductURL: "https://shopee.com.br/product/123"},
		{ID: MarketplaceAliExpress, Label: "AliExpress", CredentialField: "affiliate_id", Placeholder: "SEU_ID",
			Hint: "ID de afiliado AliExpress", TestProductURL: "https://www.aliexpress.com/item/123.html"},
		{ID: MarketplaceKabum, Label: "Kabum", CredentialField: "affiliate_id", Placeholder: "SEU_ID",
			Hint: "ID de afiliado Kabum", TestProductURL: "https://www.kabum.com.br/produto/123"},
		{ID: MarketplaceAmericanas, Label: "Americanas", CredentialField: "affiliate_id", Placeholder: "SEU_ID",
			Hint: "ID de afiliado Americanas", TestProductURL: "https://www.americanas.com.br/produto/123"},
		{ID: MarketplaceCasasBahia, Label: "Casas Bahia", CredentialField: "affiliate_id", Placeholder: "SEU_ID",
			Hint: "ID de afiliado Casas Bahia", TestProductURL: "https://www.casasbahia.com.br/produto/123"},
	}
}

// InferMarketplaceFromProductURL deduz o marketplace interno a partir do host da URL do produto.
func InferMarketplaceFromProductURL(productURL string) string {
	u, err := url.Parse(productURL)
	if err != nil || u.Hostname() == "" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	switch {
	case strings.Contains(host, "amazon."):
		return MarketplaceAmazon
	case strings.Contains(host, "mercadolivre") || strings.Contains(host, "mercadoliv") ||
		strings.Contains(host, "mlcdn") || strings.Contains(host, "meli.com"):
		return MarketplaceMercadoLivre
	case strings.Contains(host, "magazineluiza") || strings.Contains(host, "magalu"):
		return MarketplaceMagalu
	case strings.Contains(host, "shopee."):
		return MarketplaceShopee
	case strings.Contains(host, "aliexpress"):
		return MarketplaceAliExpress
	case strings.Contains(host, "kabum"):
		return MarketplaceKabum
	case strings.Contains(host, "americanas"):
		return MarketplaceAmericanas
	case strings.Contains(host, "casasbahia") || strings.Contains(host, "casas-bahia"):
		return MarketplaceCasasBahia
	default:
		return ""
	}
}
