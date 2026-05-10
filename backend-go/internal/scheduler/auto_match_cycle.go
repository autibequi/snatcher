package scheduler

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/curation"
	"snatcher/backendv2/internal/debugagent"
	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// AutoMatchPlannedRow é uma linha da simulação do próximo ciclo — mesma ordem e regras que RunAutoMatchWorker.
type AutoMatchPlannedRow struct {
	ProductID    int64   `json:"product_id"`
	ChannelID    int64   `json:"channel_id"`
	ProductName  string  `json:"product_name"`
	ChannelName  string  `json:"channel_name"`
	Score        float64 `json:"score"`
	DispatchRank int     `json:"dispatch_rank"` // N-ésimo disparo para este canal neste ciclo simulado (1-based)
	MaxPerRun    int     `json:"max_per_run"`
	InThisCycle  bool    `json:"in_this_cycle"` // dispatch_rank <= max_per_run do canal
}

// SimulateAutoMatchCycle replica o ciclo do worker sem persistir dispatches nem logs (sem criar short links).
func SimulateAutoMatchCycle(ctx context.Context, st store.Store, now time.Time) ([]AutoMatchPlannedRow, error) {
	var planned []AutoMatchPlannedRow
	err := runAutoMatchCycle(ctx, st, now, true, &planned)
	return planned, err
}

// runAutoMatchCycle é o núcleo compartilhado entre o worker real e a prévia.
// dryRun=true: não grava BD nem chama GetOrCreateShortLink; acumula planned.
func runAutoMatchCycle(ctx context.Context, st store.Store, now time.Time, dryRun bool, plannedOut *[]AutoMatchPlannedRow) error {
	_ = ctx // reservado para cancelamento futuro
	cfg, err := st.GetConfig()
	if err != nil {
		slog.Error("auto match: get config", "err", err)
		return err
	}
	if !cfg.AutoMatchEnabled {
		return nil
	}

	intervalSec := curation.NormalizeAutoMatchIntervalSeconds(cfg)
	if !dryRun && cfg.AutoMatchLastWorkerRunAt.Valid {
		if now.Sub(cfg.AutoMatchLastWorkerRunAt.Time) < time.Duration(intervalSec)*time.Second {
			return nil
		}
	}

	if !dryRun {
		if err := st.TouchAutoMatchWorkerRun(now); err != nil {
			slog.Warn("auto match: touch worker run", "err", err)
		}
		debugagent.Write("H3", "auto_match_worker.go:RunAutoMatchWorker", "cycle_start", map[string]any{
			"full_auto_mode":          cfg.FullAutoMode,
			"auto_match_threshold":    cfg.AutoMatchThreshold,
			"auto_match_only_curated": cfg.AutoMatchOnlyCurated,
			"auto_match_max_per_run":  cfg.AutoMatchMaxPerRun,
			"interval_seconds":        intervalSec,
			"product_cursor":          cfg.AutoMatchProductCursor,
		}, "")
	}

	rawProducts, err := st.ListCatalogProductsAfterCursor(500, cfg.AutoMatchProductCursor, false)
	if err != nil {
		slog.Error("auto match: list products", "err", err)
		return err
	}
	maxBatchID := int64(0)
	for _, p := range rawProducts {
		if p.ID > maxBatchID {
			maxBatchID = p.ID
		}
	}
	products := store.FilterCatalogProductsForAutoMatch(rawProducts, cfg.AutoMatchOnlyCurated)
	if len(products) == 0 {
		if !dryRun && maxBatchID > 0 {
			if err := st.SetAutoMatchProductCursor(maxBatchID); err != nil {
				slog.Warn("auto match: set product cursor", "err", err)
			}
		}
		return nil
	}

	automations, err := st.ListChannelAutomations(true)
	if err != nil {
		slog.Error("auto match: list channel automations", "err", err)
		return err
	}
	if len(automations) == 0 {
		slog.Warn("auto match: nenhuma automação de canal habilitada (enabled=true)")
		return nil
	}

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
		slog.Warn("auto match: nenhum canal com auto_match_enabled ou todos pausados (paused_until)")
		return nil
	}

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
		slog.Warn("auto match: nenhum canal carregado após GetChannel")
		return nil
	}

	channels := make([]models.Channel, 0, len(channelsByID))
	for _, ch := range channelsByID {
		channels = append(channels, ch)
	}

	products = sortProductsByBestAutoMatchScore(cfg, products, channels, automationsByChannelID)

	recentLogs, recentErr := st.ListAutoMatchLogs(500)
	if recentErr != nil {
		slog.Warn("auto match: list recent logs", "err", recentErr)
		recentLogs = nil
	}

	const maxPendingPerGroup = 10
	pendingByGroup := make(map[int64]int)
	if cs, err := st.CountPendingTargetsByGroup(); err != nil {
		slog.Warn("auto match: count pending targets by group", "err", err)
	} else {
		for _, c := range cs {
			pendingByGroup[c.GroupID] = c.Count
		}
	}

	affiliatePrograms, affErr := st.ListAffiliatePrograms(nil)
	if affErr != nil {
		slog.Error("auto match: list affiliate programs", "err", affErr)
		affiliatePrograms = nil
	}

	missingOfferURL := 0
	for _, p := range products {
		if !p.LowestPriceURL.Valid || p.LowestPriceURL.String == "" {
			missingOfferURL++
		}
	}

	sentByChannel := make(map[int64]int, len(channelsByID))
	skip := struct {
		NoAutoForScore     int
		ChannelFilter      int
		BelowThreshold     int
		MaxPerRunSat       int
		Cooldown           int
		ListGroupsErr      int
		NoActiveGroups     int
		AllGroupsSaturated int
		MarshalErr         int
		MissingOfferURL    int
		CreateDispatchErr  int
	}{}

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

		productTaxonomies, taxErr := st.ListProductTaxonomies(p.ID)
		if taxErr != nil {
			slog.Warn("auto match: list product taxonomies", "product_id", p.ID, "err", taxErr)
			productTaxonomies = nil
		}
		productAttrs := parseProductAttributes(p)

		for _, s := range scores {
			auto, ok := automationsByChannelID[s.ChannelID]
			if !ok {
				skip.NoAutoForScore++
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

			matchValue := ""
			if auto.MatchValue.Valid {
				matchValue = auto.MatchValue.String
			}
			maxPrice := 0.0
			if auto.MaxPrice.Valid {
				maxPrice = auto.MaxPrice.Float64
			}
			if !match.MatchesChannelFilter(input, nullFloat(p.LowestPrice), auto.MatchType, matchValue, maxPrice) {
				skip.ChannelFilter++
				continue
			}

			if s.Value < threshold {
				skip.BelowThreshold++
				continue
			}
			if sentByChannel[s.ChannelID] >= maxPerRun {
				skip.MaxPerRunSat++
				continue
			}

			cutoff := now.Add(-cooldown)
			alreadySent := false
			for _, l := range recentLogs {
				if l.ProductID == p.ID && l.ChannelID == s.ChannelID && l.CreatedAt.After(cutoff) {
					alreadySent = true
					break
				}
			}
			if alreadySent {
				skip.Cooldown++
				continue
			}

			groups, err := st.ListRedesignGroups(s.ChannelID, "", "active")
			if err != nil {
				skip.ListGroupsErr++
				slog.Warn("auto match: list groups", "channel_id", s.ChannelID, "channel", s.ChannelName, "product_id", p.ID, "err", err)
				continue
			}
			if len(groups) == 0 {
				skip.NoActiveGroups++
				slog.Warn("auto match: canal sem grupos ativos", "channel_id", s.ChannelID, "channel", s.ChannelName, "product_id", p.ID)
				continue
			}

			targets := make([]models.DispatchTarget, 0, len(groups))
			for _, g := range groups {
				if pendingByGroup[g.ID] >= maxPendingPerGroup {
					continue
				}
				targets = append(targets, models.DispatchTarget{GroupID: g.ID})
				pendingByGroup[g.ID]++
			}
			if len(targets) == 0 {
				skip.AllGroupsSaturated++
				continue
			}

			msgText := buildAutoMatchMessage(p)
			msgMap := map[string]any{"text": msgText}
			if p.ImageURL.Valid && p.ImageURL.String != "" {
				msgMap["media_url"] = p.ImageURL.String
			}
			msgBytes, jerr := json.Marshal(msgMap)
			if jerr != nil {
				skip.MarshalErr++
				slog.Error("auto match: marshal message JSON", "product_id", p.ID, "channel_id", s.ChannelID, "err", jerr)
				continue
			}

			if !p.LowestPriceURL.Valid || p.LowestPriceURL.String == "" {
				skip.MissingOfferURL++
				continue
			}

			rankForChannel := sentByChannel[s.ChannelID] + 1
			if dryRun {
				if plannedOut != nil {
					*plannedOut = append(*plannedOut, AutoMatchPlannedRow{
						ProductID:    p.ID,
						ChannelID:    s.ChannelID,
						ProductName:  p.CanonicalName,
						ChannelName:  s.ChannelName,
						Score:        s.Value,
						DispatchRank: rankForChannel,
						MaxPerRun:    maxPerRun,
						InThisCycle:  rankForChannel <= maxPerRun,
					})
				}
				sentByChannel[s.ChannelID]++
				continue
			}

			src := ""
			if p.LowestPriceSource.Valid {
				src = p.LowestPriceSource.String
			}
			affiliateLink := p.LowestPriceURL.String
			linkToShorten := affiliateLink
			if affiliates.HasAffiliate(src, affiliatePrograms) {
				builtLink, _, blErr := affiliates.BuildLink(p.LowestPriceURL.String, src, affiliatePrograms)
				if blErr != nil {
					slog.Warn("auto match: build affiliate link", "product_id", p.ID, "marketplace", src, "err", blErr)
				}
				affiliateLink = builtLink
				linkToShorten = builtLink
			}
			if shortID, err := st.GetOrCreateShortLink(linkToShorten, src); err != nil {
				urlSample := linkToShorten
				if len(urlSample) > 120 {
					urlSample = urlSample[:120] + "…"
				}
				slog.Warn("auto match: short link", "product_id", p.ID, "channel_id", s.ChannelID, "url_sample", urlSample, "err", err)
			} else {
				domain := "beta.autibequi.com"
				if cfg.AppDomain.Valid && cfg.AppDomain.String != "" {
					domain = cfg.AppDomain.String
				}
				affiliateLink = "https://" + domain + "/v/" + shortID
			}

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
				skip.CreateDispatchErr++
				slog.Error("auto match: create dispatch", "err", err)
				continue
			}

			logID, err := st.CreateAutoMatchLog(models.AutoMatchLog{
				ProductID:  p.ID,
				ChannelID:  s.ChannelID,
				DispatchID: dispatchID,
				Score:      s.Value,
			})
			if err != nil {
				slog.Warn("auto match: create auto-match log", "dispatch_id", dispatchID, "product_id", p.ID, "channel_id", s.ChannelID, "err", err)
			}
			if err == nil && logID > 0 {
				ch := channelsByID[s.ChannelID]
				clicksLast30d, clkErr := st.CountChannelClicksLast30d(s.ChannelID)
				if clkErr != nil {
					slog.Warn("auto match: count channel clicks 30d", "channel_id", s.ChannelID, "err", clkErr)
				}
				detailedResult := match.ScoreChannelDetailed(input, ch, productTaxonomies, productAttrs, clicksLast30d, match.Weights{})
				breakdownJSON, brErr := json.Marshal(detailedResult.Breakdown)
				if brErr != nil {
					slog.Warn("auto match: marshal score breakdown", "log_id", logID, "err", brErr)
				} else if upErr := st.UpdateAutoMatchScoreBreakdown(logID, breakdownJSON, detailedResult.Reasons); upErr != nil {
					slog.Warn("auto match: update score breakdown", "log_id", logID, "err", upErr)
				}
			}

			slog.Info("auto match: dispatched", "product", p.CanonicalName, "channel", s.ChannelName, "score", s.Value)
			sentByChannel[s.ChannelID]++
		}
	}

	nDisp := 0
	for _, v := range sentByChannel {
		nDisp += v
	}
	if dryRun {
		return nil
	}
	if maxBatchID > 0 {
		if err := st.SetAutoMatchProductCursor(maxBatchID); err != nil {
			slog.Warn("auto match: set product cursor", "err", err)
		}
	}
	if nDisp == 0 {
		slog.Info("auto match: cycle finished — no dispatches",
			"products_evaluated", len(products),
			"products_missing_offer_url", missingOfferURL,
			"also_blocks", "score<threshold, cooldown, channel filters, group queue saturation, no active WA groups",
			"skip_no_auto", skip.NoAutoForScore,
			"skip_channel_filter", skip.ChannelFilter,
			"skip_below_threshold", skip.BelowThreshold,
			"skip_max_per_run", skip.MaxPerRunSat,
			"skip_cooldown", skip.Cooldown,
			"skip_list_groups_err", skip.ListGroupsErr,
			"skip_no_groups", skip.NoActiveGroups,
			"skip_groups_saturated", skip.AllGroupsSaturated,
			"skip_marshal", skip.MarshalErr,
			"skip_missing_url_inner", skip.MissingOfferURL,
			"skip_create_dispatch", skip.CreateDispatchErr,
		)
		debugagent.Write("H3", "auto_match_worker.go:RunAutoMatchWorker", "cycle_no_dispatches", map[string]any{
			"products_evaluated":        len(products),
			"missing_offer_url_precalc": missingOfferURL,
			"skip":                      skip,
		}, "")
	} else {
		slog.Info("auto match: cycle finished", "dispatches_created", nDisp)
	}
	return nil
}
