package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// RunAutoMatchWorker executa o ciclo de auto-match: busca produtos recentes,
// calcula score com todos os canais e dispara para os grupos dos canais com score >= threshold.
func RunAutoMatchWorker(ctx context.Context, st store.Store) {
	cfg, err := st.GetConfig()
	if err != nil || !cfg.AutoMatchEnabled {
		return
	}

	threshold := cfg.AutoMatchThreshold
	if threshold <= 0 {
		threshold = 50
	}
	maxPerRun := cfg.AutoMatchMaxPerRun
	if maxPerRun <= 0 {
		maxPerRun = 3
	}

	products, err := st.ListCatalogProducts(20, 0)
	if err != nil {
		slog.Error("auto match: list products", "err", err)
		return
	}
	if len(products) == 0 {
		return
	}

	channels, err := st.ListChannels()
	if err != nil {
		slog.Error("auto match: list channels", "err", err)
		return
	}
	if len(channels) == 0 {
		return
	}

	// Carregar logs recentes para evitar re-dispatch do mesmo produto/canal
	recentLogs, _ := st.ListAutoMatchLogs(500)
	type pairKey struct{ productID, channelID int64 }
	recentPairs := make(map[pairKey]bool, len(recentLogs))
	cutoff := time.Now().Add(-6 * time.Hour)
	for _, l := range recentLogs {
		if l.CreatedAt.After(cutoff) {
			recentPairs[pairKey{l.ProductID, l.ChannelID}] = true
		}
	}

	sent := 0
	for _, p := range products {
		if sent >= maxPerRun {
			break
		}

		input := match.ProductInput{
			Name:     p.CanonicalName,
			Category: firstTag(p),
			Price:    nullFloat(p.LowestPrice),
		}
		if p.Brand.Valid {
			input.Brand = p.Brand.String
		}

		scores := match.RankChannels(input, channels)

		for _, s := range scores {
			if s.Value < threshold {
				break // já ordenado desc
			}
			if sent >= maxPerRun {
				break
			}
			// Pular se já foi disparado para este canal nas últimas 6h
			if recentPairs[pairKey{p.ID, s.ChannelID}] {
				continue
			}

			// Buscar grupos do canal
			groups, err := st.ListRedesignGroups(s.ChannelID, "", "active")
			if err != nil || len(groups) == 0 {
				continue
			}

			targets := make([]models.DispatchTarget, 0, len(groups))
			for _, g := range groups {
				targets = append(targets, models.DispatchTarget{GroupID: g.ID})
			}

			msgText := buildAutoMatchMessage(p)
			msgMap := map[string]any{"text": msgText}
			if p.ImageURL.Valid && p.ImageURL.String != "" {
				msgMap["media_url"] = p.ImageURL.String
			}
			msgBytes, _ := json.Marshal(msgMap)

			// Gerar affiliate link a partir da URL do menor preço
			affiliateLink := ""
			if p.LowestPriceURL.Valid && p.LowestPriceURL.String != "" {
				src := ""
				if p.LowestPriceSource.Valid {
					src = p.LowestPriceSource.String
				}
				programs, _ := st.ListAffiliatePrograms(nil)
				if link, _, err := affiliates.BuildLink(p.LowestPriceURL.String, src, programs); err == nil {
					affiliateLink = link
				} else {
					affiliateLink = p.LowestPriceURL.String
				}
			}

			d := models.Dispatch{
				ComposedBy:    "auto-match",
				Message:       msgBytes,
				AffiliateLink: affiliateLink,
				Status:        "queued",
			}
			if p.ID > 0 {
				d.ProductID = models.NullInt64{}
				d.ProductID.Int64 = p.ID
				d.ProductID.Valid = true
			}

			dispatchID, err := st.CreateDispatch(d, targets)
			if err != nil {
				slog.Error("auto match: create dispatch", "err", err)
				continue
			}

			_ = st.CreateAutoMatchLog(models.AutoMatchLog{
				ProductID:  p.ID,
				ChannelID:  s.ChannelID,
				DispatchID: dispatchID,
				Score:      s.Value,
			})

			slog.Info("auto match: dispatched", "product", p.CanonicalName, "channel", s.ChannelName, "score", s.Value)
			sent++
		}
	}
}

func firstTag(p models.CatalogProduct) string {
	tags := p.GetTags()
	if len(tags) > 0 {
		return tags[0]
	}
	return ""
}

func nullFloat(n models.NullFloat64) float64 {
	if n.Valid {
		return n.Float64
	}
	return 0
}

func buildAutoMatchMessage(p models.CatalogProduct) string {
	price := nullFloat(p.LowestPrice)
	name := p.CanonicalName
	if price > 0 {
		return fmt.Sprintf("🔥 %s\n💰 R$ %.2f\n\n{link}", name, price)
	}
	return "🔥 " + name + "\n\n{link}"
}
