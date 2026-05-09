package admin

import (
	"sort"
	"time"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// ChannelAutomationPreviewRow is one row of GET /api/automations/:id/preview (and building blocks for global auto-match preview).
type ChannelAutomationPreviewRow struct {
	ProductID   int64   `json:"product_id"`
	ProductName string  `json:"product_name"`
	Score       float64 `json:"score"`
	Price       float64 `json:"price,omitempty"`
	AlreadySent bool    `json:"already_sent"`
}

// channelPreviewCatalogLimit matches auto_match_worker ListCatalogProducts depth (100 active products).
const channelPreviewCatalogLimit = 100

// BuildChannelAutomationPreview computes match candidates for a single channel using the same rules as the worker for that channel.
func BuildChannelAutomationPreview(st store.Store, channelID int64) ([]ChannelAutomationPreviewRow, float64, int, string, error) {
	cfg, err := st.GetConfig()
	if err != nil {
		return nil, 0, 0, "", err
	}
	auto, _ := st.GetChannelAutomation(channelID)

	threshold := cfg.AutoMatchThreshold
	if auto != nil && auto.Threshold.Valid {
		threshold = auto.Threshold.Float64
	}
	if threshold <= 0 {
		threshold = 50
	}

	maxPerRun := cfg.AutoMatchMaxPerRun
	if auto != nil && auto.MaxPerRun.Valid {
		maxPerRun = int(auto.MaxPerRun.Int64)
	}
	if maxPerRun <= 0 {
		maxPerRun = 3
	}

	cooldownHours := 6
	if auto != nil && auto.CooldownHours > 0 {
		cooldownHours = auto.CooldownHours
	}

	matchType := "all"
	matchValue := ""
	maxPrice := 0.0
	if auto != nil {
		matchType = auto.MatchType
		if auto.MatchValue.Valid {
			matchValue = auto.MatchValue.String
		}
		if auto.MaxPrice.Valid {
			maxPrice = auto.MaxPrice.Float64
		}
	}

	channel, err := st.GetChannel(channelID)
	if err != nil {
		return nil, 0, 0, "", err
	}

	// Mesmo kill-switch que RunAutoMatchWorker — senão a prévia engana.
	if !cfg.AutoMatchEnabled {
		return []ChannelAutomationPreviewRow{}, threshold, maxPerRun, channel.Name, nil
	}

	// inactive=false — alinhado ao worker de auto-match
	products, err := st.ListCatalogProducts(channelPreviewCatalogLimit, 0, false)
	if err != nil {
		return nil, 0, 0, "", err
	}

	recentLogs, _ := st.ListAutoMatchLogsByChannel(channelID, 200)
	cutoff := time.Now().Add(-time.Duration(cooldownHours) * time.Hour)
	recentSet := make(map[int64]bool, len(recentLogs))
	for _, l := range recentLogs {
		if l.CreatedAt.After(cutoff) {
			recentSet[l.ProductID] = true
		}
	}

	channels := []models.Channel{channel}
	var items []ChannelAutomationPreviewRow

	for _, p := range products {
		inp := match.ProductInput{Name: p.CanonicalName}
		if p.Brand.Valid {
			inp.Brand = p.Brand.String
		}
		if p.LowestPrice.Valid {
			inp.Price = p.LowestPrice.Float64
		}
		if tags := p.GetTags(); len(tags) > 0 {
			inp.Category = tags[0]
		}
		price := 0.0
		if p.LowestPrice.Valid {
			price = p.LowestPrice.Float64
		}

		if !match.MatchesChannelFilter(inp, price, matchType, matchValue, maxPrice) {
			continue
		}

		scores := match.RankChannels(inp, channels)
		if len(scores) == 0 || scores[0].Value < threshold {
			continue
		}

		// Alinhado ao worker: sem URL de oferta o dispatch não é criado.
		if !p.LowestPriceURL.Valid || p.LowestPriceURL.String == "" {
			continue
		}

		items = append(items, ChannelAutomationPreviewRow{
			ProductID:   p.ID,
			ProductName: p.CanonicalName,
			Score:       scores[0].Value,
			Price:       price,
			AlreadySent: recentSet[p.ID],
		})
	}

	if items == nil {
		items = []ChannelAutomationPreviewRow{}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Score > items[j].Score })
	if len(items) > 20 {
		items = items[:20]
	}

	return items, threshold, maxPerRun, channel.Name, nil
}
