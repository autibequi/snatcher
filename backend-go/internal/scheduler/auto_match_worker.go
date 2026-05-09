package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
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
	if err != nil {
		return
	}
	if cfg.AutoMatchEnabled {
		_ = st.TouchAutoMatchWorkerRun(time.Now())
	}
	if !cfg.AutoMatchEnabled {
		return
	}

	now := time.Now()

	products, err := st.ListCatalogProducts(100, 0, false) // false = só ativos (inactive=false)
	if err != nil {
		slog.Error("auto match: list products", "err", err)
		return
	}
	products = store.FilterCatalogProductsForAutoMatch(products, cfg.AutoMatchOnlyCurated)
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

	// Ordenar por melhor score elegível (threshold + filtro do canal), não só por updated_at do catálogo.
	// Sem isto, os primeiros 100 produtos por data faziam outros SKUs consumirem max_per_run antes dos matches da prévia (ex.: Orfeu score 58).
	products = sortProductsByBestAutoMatchScore(cfg, products, channels, automationsByChannelID)

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

		// Carregar taxonomias do produto para scoring detalhado
		productTaxonomies, _ := st.ListProductTaxonomies(p.ID)
		productAttrs := parseProductAttributes(p)

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

			logID, err := st.CreateAutoMatchLog(models.AutoMatchLog{
				ProductID:  p.ID,
				ChannelID:  s.ChannelID,
				DispatchID: dispatchID,
				Score:      s.Value,
			})
			if err == nil && logID > 0 {
				// Calcular score detalhado com breakdown e persisti-lo
				ch := channelsByID[s.ChannelID]
				// Query cliques nos últimos 30 dias para calcular history score
				clicksLast30d, _ := st.CountChannelClicksLast30d(s.ChannelID)
				detailedResult := match.ScoreChannelDetailed(input, ch, productTaxonomies, productAttrs, clicksLast30d, match.Weights{})
				breakdownJSON, _ := json.Marshal(detailedResult.Breakdown)
				_ = st.UpdateAutoMatchScoreBreakdown(logID, breakdownJSON, detailedResult.Reasons)
			}

			slog.Info("auto match: dispatched", "product", p.CanonicalName, "channel", s.ChannelName, "score", s.Value)
			sentByChannel[s.ChannelID]++
		}
	}

	nDisp := 0
	for _, v := range sentByChannel {
		nDisp += v
	}
	if nDisp == 0 {
		slog.Info("auto match: cycle finished — no dispatches (threshold, cooldown, saturated groups, filters or missing offer URL)")
	} else {
		slog.Info("auto match: cycle finished", "dispatches_created", nDisp)
	}
}

// sortProductsByBestAutoMatchScore replica a prioridade «melhor score primeiro» da prévia por canal,
// mantendo empates estáveis por updated_at DESC.
func sortProductsByBestAutoMatchScore(cfg models.AppConfig, products []models.CatalogProduct, channels []models.Channel, autoBy map[int64]models.ChannelAutomation) []models.CatalogProduct {
	type ranked struct {
		p    models.CatalogProduct
		best float64
	}
	outRank := make([]ranked, 0, len(products))
	for _, p := range products {
		if !p.LowestPriceURL.Valid || p.LowestPriceURL.String == "" {
			outRank = append(outRank, ranked{p: p, best: -1})
			continue
		}
		input := match.ProductInput{
			Name:     p.CanonicalName,
			Category: firstTag(p),
			Price:    nullFloat(p.LowestPrice),
		}
		if p.Brand.Valid {
			input.Brand = p.Brand.String
		}
		price := nullFloat(p.LowestPrice)
		scores := match.RankChannels(input, channels)
		best := -1.0
		for _, s := range scores {
			auto, ok := autoBy[s.ChannelID]
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
			matchValue := ""
			if auto.MatchValue.Valid {
				matchValue = auto.MatchValue.String
			}
			maxPrice := 0.0
			if auto.MaxPrice.Valid {
				maxPrice = auto.MaxPrice.Float64
			}
			if !match.MatchesChannelFilter(input, price, auto.MatchType, matchValue, maxPrice) {
				continue
			}
			if s.Value < threshold {
				continue
			}
			if s.Value > best {
				best = s.Value
			}
		}
		outRank = append(outRank, ranked{p: p, best: best})
	}
	sort.SliceStable(outRank, func(i, j int) bool {
		if outRank[i].best != outRank[j].best {
			return outRank[i].best > outRank[j].best
		}
		// Sem canal elegível neste lote: mantém ordem por frescor de scrape
		return outRank[i].p.UpdatedAt.After(outRank[j].p.UpdatedAt)
	})
	out := make([]models.CatalogProduct, len(outRank))
	for i := range outRank {
		out[i] = outRank[i].p
	}
	return out
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

// parseProductAttributes extrai mapa de atributos do campo Attributes (JSONB) do produto.
// Formato esperado: {"color": [1, 2], "size": [3, 4]}
// Se o campo estiver vazio ou inválido, retorna map vazio.
func parseProductAttributes(p models.CatalogProduct) map[string][]int64 {
	result := make(map[string][]int64)
	if len(p.Attributes) == 0 {
		return result
	}
	err := json.Unmarshal(p.Attributes, &result)
	if err != nil {
		// Log opcional se quiser
		slog.Warn("parse product attributes", "product_id", p.ID, "err", err)
		return make(map[string][]int64)
	}
	return result
}
