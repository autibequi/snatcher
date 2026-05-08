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

	products, err := st.ListCatalogProducts(100, 0, false) // false = só ativos (inactive=false)
	if err != nil {
		slog.Error("auto match: list products", "err", err)
		return
	}
	if len(products) == 0 {
		return
	}

	automations, err := st.ListChannelAutomations(true) // só enabled=true
	if err != nil {
		slog.Error("auto match: list channel automations", "err", err)
		return
	}
	if len(automations) == 0 {
		return
	}

	// Filtrar por auto_match_enabled e paused_until
	now := time.Now()
	active := make([]models.ChannelAutomation, 0, len(automations))
	for _, a := range automations {
		if !a.AutoMatchEnabled {
			continue
		}
		if a.PausedUntil.Valid && a.PausedUntil.Time.After(now) {
			continue
		}
		active = append(active, a)
	}
	if len(active) == 0 {
		return
	}

	// Buscar canais completos para alimentar match.RankChannels (que precisa de Channel.Audience)
	channelsByID := make(map[int64]models.Channel, len(active))
	automationsByChannelID := make(map[int64]models.ChannelAutomation, len(active))
	for _, a := range active {
		ch, err := st.GetChannel(a.ChannelID)
		if err != nil {
			slog.Warn("auto match: get channel failed, skipping", "channel_id", a.ChannelID, "err", err)
			continue
		}
		channelsByID[a.ChannelID] = ch
		automationsByChannelID[a.ChannelID] = a
	}
	if len(channelsByID) == 0 {
		return
	}

	// Montar slice de Channel para RankChannels
	channels := make([]models.Channel, 0, len(channelsByID))
	for _, ch := range channelsByID {
		channels = append(channels, ch)
	}

	// Carregar logs recentes para evitar re-dispatch do mesmo produto/canal (avaliado por canal com cooldown próprio)
	recentLogs, _ := st.ListAutoMatchLogs(500)

	// Backpressure: não criar novos dispatches se grupo já tem fila grande pendente.
	// Default: limit de 10 targets pending+sending por grupo. Acima disso, skip.
	const maxPendingPerGroup = 10
	pendingByGroup := make(map[int64]int)
	if cs, err := st.CountPendingTargetsByGroup(); err == nil {
		for _, c := range cs {
			pendingByGroup[c.GroupID] = c.Count
		}
	}

	sentByChannel := make(map[int64]int, len(channelsByID))
	for _, p := range products {
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
			// Resolver threshold/maxPerRun/cooldown específicos do canal
			auto, ok := automationsByChannelID[s.ChannelID]
			if !ok {
				continue
			}

			threshold := cfg.AutoMatchThreshold
			if auto.Threshold.Valid {
				threshold = auto.Threshold.Float64
			}
			if threshold <= 0 {
				threshold = 50
			}

			maxPerRun := cfg.AutoMatchMaxPerRun
			if auto.MaxPerRun.Valid {
				maxPerRun = int(auto.MaxPerRun.Int64)
			}
			if maxPerRun <= 0 {
				maxPerRun = 3
			}

			cooldown := time.Duration(auto.CooldownHours) * time.Hour
			if cooldown <= 0 {
				cooldown = 6 * time.Hour
			}

			// Aplicar filtros match_type/match_value/max_price do canal
			matchValue := ""
			if auto.MatchValue.Valid {
				matchValue = auto.MatchValue.String
			}
			maxPrice := 0.0
			if auto.MaxPrice.Valid {
				maxPrice = auto.MaxPrice.Float64
			}
			if !match.MatchesChannelFilter(input, nullFloat(p.LowestPrice), auto.MatchType, matchValue, maxPrice) {
				continue
			}

			if s.Value < threshold {
				continue // threshold é por canal — não pode break, outros canais podem ter threshold menor
			}
			if sentByChannel[s.ChannelID] >= maxPerRun {
				continue // canal saturado neste ciclo, mas outros canais ainda podem receber
			}

			// Pular se já foi disparado para este canal dentro do cooldown (cooldown é por canal)
			cutoff := now.Add(-cooldown)
			alreadySent := false
			for _, l := range recentLogs {
				if l.ProductID == p.ID && l.ChannelID == s.ChannelID && l.CreatedAt.After(cutoff) {
					alreadySent = true
					break
				}
			}
			if alreadySent {
				continue
			}

			// Buscar grupos do canal
			groups, err := st.ListRedesignGroups(s.ChannelID, "", "active")
			if err != nil || len(groups) == 0 {
				continue
			}

			// Backpressure: filtra só grupos abaixo do limite de fila
			targets := make([]models.DispatchTarget, 0, len(groups))
			for _, g := range groups {
				if pendingByGroup[g.ID] >= maxPendingPerGroup {
					continue // grupo saturado, deixa o worker drenar antes de criar mais
				}
				targets = append(targets, models.DispatchTarget{GroupID: g.ID})
				pendingByGroup[g.ID]++ // counta o que vamos criar
			}
			if len(targets) == 0 {
				continue // todos os grupos saturados, skip este produto/canal
			}

			msgText := buildAutoMatchMessage(p)
			msgMap := map[string]any{"text": msgText}
			if p.ImageURL.Valid && p.ImageURL.String != "" {
				msgMap["media_url"] = p.ImageURL.String
			}
			msgBytes, _ := json.Marshal(msgMap)

			if !p.LowestPriceURL.Valid || p.LowestPriceURL.String == "" {
				continue
			}
			src := ""
			if p.LowestPriceSource.Valid {
				src = p.LowestPriceSource.String
			}
			programs, _ := st.ListAffiliatePrograms(nil)
			// Affiliate link quando configurado; caso contrário usa URL original (não bloqueia o dispatch)
			affiliateLink := p.LowestPriceURL.String
			linkToShorten := affiliateLink
			if affiliates.HasAffiliate(src, programs) {
				builtLink, _, _ := affiliates.BuildLink(p.LowestPriceURL.String, src, programs)
				affiliateLink = builtLink
				linkToShorten = builtLink
			}
			// Encurtar
			if shortID, err := st.GetOrCreateShortLink(linkToShorten, src); err == nil {
				domain := "beta.autibequi.com"
				if cfg.AppDomain.Valid && cfg.AppDomain.String != "" {
					domain = cfg.AppDomain.String
				}
				affiliateLink = "https://" + domain + "/v/" + shortID
			}

			// full_auto_mode=true → envia direto; false → aguarda aprovação humana
			dispatchStatus := "queued"
			if !cfg.FullAutoMode {
				dispatchStatus = "pending_approval"
			}
			d := models.Dispatch{
				ComposedBy:    "auto-match",
				Message:       msgBytes,
				AffiliateLink: affiliateLink,
				Status:        dispatchStatus,
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
			sentByChannel[s.ChannelID]++
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
