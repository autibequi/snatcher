package repositories

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// GetOperationalContext agrega canais ativos, crawlers, contagens de cobertura e lacunas marketplace/audiência.
func (s *SQLStore) GetOperationalContext(ctx context.Context) (OperationalContext, error) {
	var oc OperationalContext

	_ = s.db.GetContext(ctx, &oc.ActiveProductsNoOfferURL,
		`SELECT COUNT(*) FROM catalogproduct WHERE inactive = false AND (lowest_price_url IS NULL OR lowest_price_url = '')`)
	_ = s.db.GetContext(ctx, &oc.ActiveProductsNoPrimaryTax, `
		SELECT COUNT(*) FROM catalogproduct cp WHERE inactive = false AND NOT EXISTS (
		  SELECT 1 FROM catalogproduct_taxonomy cpt
		  WHERE cpt.product_id = cp.id AND cpt.role = 'primary_category')`)

	var rows []sourceCountRow
	_ = s.db.SelectContext(ctx, &rows, `
		SELECT lowest_price_source AS source, COUNT(*)::int AS n
		FROM catalogproduct
		WHERE inactive = false AND lowest_price_source IS NOT NULL AND TRIM(lowest_price_source::text) <> ''
		GROUP BY lowest_price_source
		ORDER BY n DESC
		LIMIT 16`)
	sortSourceCounts(rows)

	for _, r := range rows {
		if len(oc.TopCatalogMarketplaces) >= 10 {
			break
		}
		oc.TopCatalogMarketplaces = append(oc.TopCatalogMarketplaces, fmt.Sprintf("%s:%d", r.Source, r.N))
	}

	terms, err := s.ListSearchTerms()
	if err != nil {
		return oc, err
	}

	unionMap := buildCrawlerUnion(terms)
	srcSeen := make(map[string]bool)
	for id := range unionMap {
		if id == "" {
			continue
		}
		if srcSeen[id] {
			continue
		}
		srcSeen[id] = true
		oc.CrawlerSourcesUnion = append(oc.CrawlerSourcesUnion, id)
	}
	sort.Strings(oc.CrawlerSourcesUnion)

	// Channel enrichment removed (Channel removed in v2 cleanup)

	for _, t := range terms {
		if !t.Active {
			continue
		}
		oc.ActiveCrawlers++
		line := fmt.Sprintf("- %q | fontes: %s | resultados último ciclo: %d",
			t.Query, strings.Join(t.GetSources(), ","), t.ResultCount)
		if len(oc.CrawlerLines) < 35 {
			oc.CrawlerLines = append(oc.CrawlerLines, line)
		}
	}

	if len(rows) > 0 {
		oc.MarketplaceGaps = marketplaceVolumeGaps(rows, unionMap, 0.04)
	}

	return oc, nil
}
