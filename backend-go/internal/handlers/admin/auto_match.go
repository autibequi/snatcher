package admin

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"time"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

const autoMatchIntervalSeconds = 60

type AutoMatchHandler struct {
	store store.Store
}

func NewAutoMatchHandler(st store.Store) *AutoMatchHandler {
	return &AutoMatchHandler{store: st}
}

// Status retorna a config atual de auto match + últimos logs.
// Inclui last_run_at (MAX created_at dos logs) e interval_seconds.
// GET /api/auto-match
func (h *AutoMatchHandler) Status(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}
	logs, _ := h.store.ListAutoMatchLogs(50)
	if logs == nil {
		logs = []models.AutoMatchLog{}
	}

	// last_run_at: MAX(created_at) dos logs como proxy do último ciclo.
	var lastRunAt *time.Time
	for _, l := range logs {
		if lastRunAt == nil || l.CreatedAt.After(*lastRunAt) {
			t := l.CreatedAt
			lastRunAt = &t
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":          cfg.AutoMatchEnabled,
		"threshold":        cfg.AutoMatchThreshold,
		"max_per_run":      cfg.AutoMatchMaxPerRun,
		"logs":             logs,
		"last_run_at":      lastRunAt,
		"interval_seconds": autoMatchIntervalSeconds,
	})
}

// Preview retorna os produtos que seriam disparados no próximo ciclo, respeitando configs por canal.
// GET /api/auto-match/preview
func (h *AutoMatchHandler) Preview(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}

	automations, _ := h.store.ListChannelAutomations(true) // enabled=true
	now := time.Now()

	// Filtrar por auto_match_enabled e paused_until
	autoByChannelID := make(map[int64]models.ChannelAutomation, len(automations))
	for _, a := range automations {
		if !a.AutoMatchEnabled {
			continue
		}
		if a.PausedUntil.Valid && a.PausedUntil.Time.After(now) {
			continue
		}
		autoByChannelID[a.ChannelID] = a
	}

	if len(autoByChannelID) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"items":       []any{},
			"threshold":   cfg.AutoMatchThreshold,
			"max_per_run": cfg.AutoMatchMaxPerRun,
		})
		return
	}

	// Carregar canais ativos
	channelsByID := make(map[int64]models.Channel, len(autoByChannelID))
	for cID := range autoByChannelID {
		ch, err := h.store.GetChannel(cID)
		if err == nil {
			channelsByID[cID] = ch
		}
	}

	products, _ := h.store.ListCatalogProducts(20, 0, true)
	recentLogs, _ := h.store.ListAutoMatchLogs(500)

	type previewItem struct {
		ProductID   int64   `json:"product_id"`
		ChannelID   int64   `json:"channel_id"`
		ProductName string  `json:"product_name"`
		ChannelName string  `json:"channel_name"`
		Score       float64 `json:"score"`
		AlreadySent bool    `json:"already_sent"`
	}

	sentByChannel := make(map[int64]int, len(autoByChannelID))
	var items []previewItem

	channels := make([]models.Channel, 0, len(channelsByID))
	for _, ch := range channelsByID {
		channels = append(channels, ch)
	}

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

		scores := match.RankChannels(inp, channels)
		for _, s := range scores {
			auto, ok := autoByChannelID[s.ChannelID]
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

			cooldownHours := 6
			if auto.CooldownHours > 0 {
				cooldownHours = auto.CooldownHours
			}

			matchValue := ""
			if auto.MatchValue.Valid {
				matchValue = auto.MatchValue.String
			}
			maxPrice := 0.0
			if auto.MaxPrice.Valid {
				maxPrice = auto.MaxPrice.Float64
			}

			if !match.MatchesChannelFilter(inp, price, auto.MatchType, matchValue, maxPrice) {
				continue
			}
			if s.Value < threshold {
				break
			}
			if sentByChannel[s.ChannelID] >= maxPerRun {
				continue
			}

			cutoff := now.Add(-time.Duration(cooldownHours) * time.Hour)
			alreadySent := false
			for _, l := range recentLogs {
				if l.ProductID == p.ID && l.ChannelID == s.ChannelID && l.CreatedAt.After(cutoff) {
					alreadySent = true
					break
				}
			}

			items = append(items, previewItem{
				ProductID:   p.ID,
				ChannelID:   s.ChannelID,
				ProductName: p.CanonicalName,
				ChannelName: s.ChannelName,
				Score:       s.Value,
				AlreadySent: alreadySent,
			})
			if !alreadySent {
				sentByChannel[s.ChannelID]++
			}
		}
		if len(items) >= 50 {
			break
		}
	}

	if items == nil {
		items = []previewItem{}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Score > items[j].Score })
	writeJSON(w, http.StatusOK, map[string]any{
		"items":       items,
		"threshold":   cfg.AutoMatchThreshold,
		"max_per_run": cfg.AutoMatchMaxPerRun,
	})
}

// Toggle habilita/desabilita o auto match.
// POST /api/auto-match/toggle
func (h *AutoMatchHandler) Toggle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled         *bool    `json:"enabled"`
		Threshold       *float64 `json:"threshold"`
		MaxPerRun       *int     `json:"max_per_run"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}

	if req.Enabled != nil {
		cfg.AutoMatchEnabled = *req.Enabled
	}
	if req.Threshold != nil {
		cfg.AutoMatchThreshold = *req.Threshold
	}
	if req.MaxPerRun != nil {
		cfg.AutoMatchMaxPerRun = *req.MaxPerRun
	}

	if err := h.store.UpdateConfig(cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao salvar config")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":     cfg.AutoMatchEnabled,
		"threshold":   cfg.AutoMatchThreshold,
		"max_per_run": cfg.AutoMatchMaxPerRun,
	})
}

// RunNow executa 1 ciclo de auto-match imediatamente (mesmo flow do worker).
// POST /api/auto-match/run-now
func (h *AutoMatchHandler) RunNow(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}

	// Carregar automações ativas para respeitar configs por canal
	automations, _ := h.store.ListChannelAutomations(true)
	now := time.Now()
	autoByChannelID := make(map[int64]models.ChannelAutomation, len(automations))
	for _, a := range automations {
		if !a.AutoMatchEnabled {
			continue
		}
		if a.PausedUntil.Valid && a.PausedUntil.Time.After(now) {
			continue
		}
		autoByChannelID[a.ChannelID] = a
	}

	products, err := h.store.ListCatalogProducts(20, 0, true)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar produtos")
		return
	}
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar canais")
		return
	}

	recentLogs, _ := h.store.ListAutoMatchLogs(500)
	type pairKey struct{ pID, cID int64 }
	recentPairs := make(map[pairKey]bool, len(recentLogs))

	dispatched := 0
	sentByChannel := make(map[int64]int, len(autoByChannelID))
	var errs []string

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

		scores := match.RankChannels(inp, channels)
		for _, s := range scores {
			auto, hasAuto := autoByChannelID[s.ChannelID]

			threshold := cfg.AutoMatchThreshold
			maxPerRun := cfg.AutoMatchMaxPerRun
			cooldownHours := 6
			matchType := "all"
			matchValue := ""
			maxPrice := 0.0

			if hasAuto {
				if auto.Threshold.Valid {
					threshold = auto.Threshold.Float64
				}
				if auto.MaxPerRun.Valid {
					maxPerRun = int(auto.MaxPerRun.Int64)
				}
				if auto.CooldownHours > 0 {
					cooldownHours = auto.CooldownHours
				}
				matchType = auto.MatchType
				if auto.MatchValue.Valid {
					matchValue = auto.MatchValue.String
				}
				if auto.MaxPrice.Valid {
					maxPrice = auto.MaxPrice.Float64
				}
			}
			if threshold <= 0 {
				threshold = 50
			}
			if maxPerRun <= 0 {
				maxPerRun = 3
			}

			if !match.MatchesChannelFilter(inp, price, matchType, matchValue, maxPrice) {
				continue
			}
			if s.Value < threshold {
				break
			}
			if sentByChannel[s.ChannelID] >= maxPerRun {
				continue
			}

			cutoff := now.Add(-time.Duration(cooldownHours) * time.Hour)
			if recentPairs[pairKey{p.ID, s.ChannelID}] {
				continue
			}
			// Verificar cooldown preciso nos logs
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

			dispatchID, dispErr := dispatchPairToStore(h.store, p, s)
			if dispErr != nil {
				slog.Error("run-now: dispatch", "err", dispErr)
				errs = append(errs, dispErr.Error())
				continue
			}
			_ = h.store.CreateAutoMatchLog(models.AutoMatchLog{
				ProductID:  p.ID,
				ChannelID:  s.ChannelID,
				DispatchID: dispatchID,
				Score:      s.Value,
			})
			dispatched++
			sentByChannel[s.ChannelID]++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"dispatched": dispatched,
		"errors":     errs,
	})
}

// DispatchOne cria 1 dispatch para um par (product_id, channel_id) específico.
// POST /api/auto-match/dispatch-one
func (h *AutoMatchHandler) DispatchOne(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductID int64 `json:"product_id"`
		ChannelID int64 `json:"channel_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ProductID == 0 || req.ChannelID == 0 {
		writeErr(w, http.StatusBadRequest, "product_id e channel_id obrigatorios")
		return
	}

	// Buscar produto
	products, err := h.store.ListCatalogProducts(200, 0, true)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar produto")
		return
	}
	var targetProduct *models.CatalogProduct
	for i := range products {
		if products[i].ID == req.ProductID {
			targetProduct = &products[i]
			break
		}
	}
	if targetProduct == nil {
		writeErr(w, http.StatusNotFound, "produto nao encontrado")
		return
	}

	// Buscar canal para obter score
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar canais")
		return
	}

	inp := match.ProductInput{Name: targetProduct.CanonicalName}
	if targetProduct.Brand.Valid {
		inp.Brand = targetProduct.Brand.String
	}
	if targetProduct.LowestPrice.Valid {
		inp.Price = targetProduct.LowestPrice.Float64
	}
	tags := targetProduct.GetTags()
	if len(tags) > 0 {
		inp.Category = tags[0]
	}

	scores := match.RankChannels(inp, channels)
	var targetScore match.Score
	for _, s := range scores {
		if s.ChannelID == req.ChannelID {
			targetScore = s
			break
		}
	}

	dispatchID, err := dispatchPairToStore(h.store, *targetProduct, targetScore)
	if err != nil {
		slog.Error("dispatch-one", "err", err, "product_id", req.ProductID, "channel_id", req.ChannelID)
		writeErr(w, http.StatusInternalServerError, "erro ao criar dispatch: "+err.Error())
		return
	}

	_ = h.store.CreateAutoMatchLog(models.AutoMatchLog{
		ProductID:  req.ProductID,
		ChannelID:  req.ChannelID,
		DispatchID: dispatchID,
		Score:      targetScore.Value,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"dispatch_id": dispatchID,
	})
}

// dispatchPairToStore cria um Dispatch para o par produto/canal e retorna o ID.
// Busca os grupos do canal e cria um dispatch com todos eles como targets.
func dispatchPairToStore(st store.Store, p models.CatalogProduct, s match.Score) (int64, error) {
	if s.ChannelID == 0 {
		return 0, fmt.Errorf("channel_id zero — score nao mapeou ao canal informado")
	}
	groups, err := st.ListRedesignGroups(s.ChannelID, "", "")
	if err != nil {
		return 0, fmt.Errorf("ListRedesignGroups: %w", err)
	}
	if len(groups) == 0 {
		return 0, fmt.Errorf("canal %d sem grupos cadastrados", s.ChannelID)
	}

	targets := make([]models.DispatchTarget, 0, len(groups))
	for _, g := range groups {
		targets = append(targets, models.DispatchTarget{GroupID: g.ID})
	}

	price := float64(0)
	if p.LowestPrice.Valid {
		price = p.LowestPrice.Float64
	}
	var msgText string
	if price > 0 {
		msgText = fmt.Sprintf("🔥 %s\n💰 R$ %.2f\n\n{link}", p.CanonicalName, price)
	} else {
		msgText = "🔥 " + p.CanonicalName + "\n\n{link}"
	}
	msgMap := map[string]any{"text": msgText}
	if p.ImageURL.Valid && p.ImageURL.String != "" {
		msgMap["media_url"] = p.ImageURL.String
	}
	msgBytes, _ := json.Marshal(msgMap)

	// Gerar affiliate link encurtado
	affiliateLink := ""
	if p.LowestPriceURL.Valid && p.LowestPriceURL.String != "" {
		src := ""
		if p.LowestPriceSource.Valid {
			src = p.LowestPriceSource.String
		}
		programs, _ := st.ListAffiliatePrograms(nil)
		builtLink := p.LowestPriceURL.String
		if link, _, err := affiliates.BuildLink(p.LowestPriceURL.String, src, programs); err == nil {
			builtLink = link
		}
		if shortID, err := st.GetOrCreateShortLink(builtLink, src); err == nil {
			cfg, _ := st.GetConfig()
			domain := "beta.autibequi.com"
			if cfg.AppDomain.Valid && cfg.AppDomain.String != "" {
				domain = cfg.AppDomain.String
			}
			affiliateLink = "https://" + domain + "/v/" + shortID
		} else {
			affiliateLink = builtLink
		}
	}

	d := models.Dispatch{
		ComposedBy:    "auto-match",
		Message:       msgBytes,
		AffiliateLink: affiliateLink,
	}
	if p.ID > 0 {
		d.ProductID = models.NullInt64{NullInt64: sql.NullInt64{Int64: p.ID, Valid: true}}
	}

	if len(targets) > 0 {
		d.Status = "queued"
		return st.CreateDispatch(d, targets)
	}
	d.Status = "draft"
	return st.CreateDispatch(d, nil)
}

