package store

import (
	"fmt"
	"sort"
	"strings"

	"snatcher/backendv2/internal/models"
)

// OperationalContext agrega canais, crawlers e métricas de cobertura do catálogo para prompts LLM.
type OperationalContext struct {
	ActiveChannels             int      `json:"active_channels"`
	ActiveCrawlers             int      `json:"active_crawlers"`
	ChannelLines               []string `json:"channel_lines"`
	CrawlerLines               []string `json:"crawler_lines"`
	ActiveProductsNoOfferURL   int      `json:"active_products_no_offer_url"`
	ActiveProductsNoPrimaryTax int      `json:"active_products_no_primary_tax"`
	TopCatalogMarketplaces     []string `json:"top_catalog_marketplaces"` // "amz:1234"
	CrawlerSourcesUnion        []string `json:"crawler_sources_union"`
	MarketplaceGaps            []string `json:"marketplace_gaps"` // marketplaces frequentes no catálogo sem crawler que os inclua
	AudienceCrawlerGaps       []string `json:"audience_crawler_gaps"` // canal ↔ queries dos crawlers
}

// FormatOperationalContextBlock texto único para incluir em prompts (PT-BR, compacto).
func FormatOperationalContextBlock(oc OperationalContext) string {
	var b strings.Builder
	b.WriteString("CANAIS ATIVOS (nome · audiência · faixa de preço):\n")
	if len(oc.ChannelLines) == 0 {
		b.WriteString("(nenhum canal ativo)\n")
	} else {
		for _, line := range oc.ChannelLines {
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
	b.WriteString("\nCRAWLERS ATIVOS (query · fontes):\n")
	if len(oc.CrawlerLines) == 0 {
		b.WriteString("(nenhum crawler ativo)\n")
	} else {
		for _, line := range oc.CrawlerLines {
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
	b.WriteString("\nCOBERTURA DO CATÁLOGO:\n")
	b.WriteString(fmt.Sprintf("- produtos ativos sem URL de oferta (não enviam para grupos): %d\n", oc.ActiveProductsNoOfferURL))
	b.WriteString(fmt.Sprintf("- produtos ativos sem categoria primária (match fraco): %d\n", oc.ActiveProductsNoPrimaryTax))
	if len(oc.TopCatalogMarketplaces) > 0 {
		b.WriteString("- marketplaces mais frequentes no catálogo (lowest_price_source): ")
		b.WriteString(strings.Join(oc.TopCatalogMarketplaces, ", "))
		b.WriteByte('\n')
	}
	if len(oc.CrawlerSourcesUnion) > 0 {
		b.WriteString("- fontes já cobertas pelos crawlers ativos: ")
		b.WriteString(strings.Join(oc.CrawlerSourcesUnion, ", "))
		b.WriteByte('\n')
	}
	if len(oc.MarketplaceGaps) > 0 {
		b.WriteString("- lacunas de marketplace (volume no catálogo sem crawler que inclua essa fonte): ")
		b.WriteString(strings.Join(oc.MarketplaceGaps, "; "))
		b.WriteByte('\n')
	}
	if len(oc.AudienceCrawlerGaps) > 0 {
		b.WriteString("- lacunas audiência↔crawler (categoria na audiência do canal sem crawler óbvio):\n")
		for _, g := range oc.AudienceCrawlerGaps {
			b.WriteString("  • ")
			b.WriteString(g)
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func trimSlice(s []string, n int) []string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func normMarketplaceKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	// alinhar com models.SearchTerm.normSource onde possível
	switch {
	case strings.Contains(s, "amazon"), s == "amz":
		return "amz"
	case strings.Contains(s, "mercado"), s == "ml":
		return "ml"
	case strings.Contains(s, "magalu"):
		return "magalu"
	case strings.Contains(s, "shopee"):
		return "shopee"
	case strings.Contains(s, "ali"):
		return "aliexpress"
	}
	if s == "" {
		return ""
	}
	return s
}

// audienceCrawlerGaps heurística: categorias declaradas na audiência sem substring nos queries dos crawlers.
func audienceCrawlerGaps(channels []models.Channel, terms []models.SearchTerm, max int) []string {
	var queries []string
	for _, t := range terms {
		if !t.Active {
			continue
		}
		queries = append(queries, strings.ToLower(strings.TrimSpace(t.Query)))
		for _, q := range t.GetQueries() {
			q = strings.ToLower(strings.TrimSpace(q))
			if q != "" {
				queries = append(queries, q)
			}
		}
	}
	joined := " " + strings.Join(queries, " ") + " "

	var out []string
	for _, ch := range channels {
		if !ch.Active {
			continue
		}
		for _, cat := range ch.Audience.Categories {
			cat = strings.TrimSpace(strings.ToLower(cat))
			if len(cat) < 3 {
				continue
			}
			tokens := strings.Fields(cat)
			ok := false
			for _, tok := range tokens {
				if len(tok) < 3 {
					continue
				}
				if strings.Contains(joined, tok) {
					ok = true
					break
				}
			}
			if !ok && strings.Contains(joined, cat) {
				ok = true
			}
			if ok {
				continue
			}
			out = append(out, fmt.Sprintf("canal %q lista categoria %q nos crawlers não há query óbvia cobrindo esse termo", ch.Name, cat))
			if len(out) >= max {
				return out
			}
		}
	}
	return out
}

func sourceCoveredByCrawlers(source string, crawlerUnion map[string]bool) bool {
	s := strings.TrimSpace(source)
	if s == "" || len(crawlerUnion) == 0 {
		return false
	}
	if crawlerUnion[s] {
		return true
	}
	low := strings.ToLower(s)
	if crawlerUnion[low] {
		return true
	}
	k := normMarketplaceKey(s)
	if k != "" && crawlerUnion[k] {
		return true
	}
	// Catálogo pode guardar rótulo longo ("Amazon.com.br"); crawlers usam ids curtos (amz).
	for u := range crawlerUnion {
		if u == "" || len(u) < 2 {
			continue
		}
		if strings.Contains(low, u) {
			return true
		}
		if k != "" && (strings.Contains(u, k) || strings.Contains(k, u)) {
			return true
		}
	}
	return false
}

func marketplaceVolumeGaps(topCatalog []sourceCountRow, crawlerUnion map[string]bool, minShare float64) []string {
	if len(topCatalog) == 0 {
		return nil
	}
	var total int64
	for _, r := range topCatalog {
		total += int64(r.N)
	}
	if total == 0 {
		return nil
	}
	var gaps []string
	for _, r := range topCatalog {
		share := float64(r.N) / float64(total)
		if share < minShare {
			continue
		}
		if sourceCoveredByCrawlers(r.Source, crawlerUnion) {
			continue
		}
		gaps = append(gaps, fmt.Sprintf("%s (~%d produtos)", r.Source, r.N))
		if len(gaps) >= 6 {
			break
		}
	}
	return gaps
}

type sourceCountRow struct {
	Source string `db:"source"`
	N      int    `db:"n"`
}

func buildCrawlerUnion(terms []models.SearchTerm) map[string]bool {
	u := make(map[string]bool)
	for _, t := range terms {
		if !t.Active {
			continue
		}
		for _, s := range t.GetSources() {
			u[s] = true
			u[normMarketplaceKey(s)] = true
		}
	}
	return u
}

func sortSourceCounts(rows []sourceCountRow) {
	sort.Slice(rows, func(i, j int) bool { return rows[i].N > rows[j].N })
}
