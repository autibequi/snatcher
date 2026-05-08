package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type AutomationsHandler struct {
	store store.Store
	llmFn func() llm.Client
}

func NewAutomationsHandler(st store.Store) *AutomationsHandler {
	return &AutomationsHandler{store: st}
}

func (h *AutomationsHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }

// GET /api/automations
// Retorna todos os canais com seu status de automação (registro pode não existir → enabled=false)
func (h *AutomationsHandler) List(w http.ResponseWriter, r *http.Request) {
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	automations, _ := h.store.ListChannelAutomations(false)
	byChannel := make(map[int64]models.ChannelAutomation, len(automations))
	for _, a := range automations {
		byChannel[a.ChannelID] = a
	}

	type row struct {
		ChannelID   int64                     `json:"channel_id"`
		ChannelName string                    `json:"channel_name"`
		Automation  *models.ChannelAutomation `json:"automation,omitempty"`
	}
	out := make([]row, 0, len(channels))
	for _, c := range channels {
		r := row{ChannelID: c.ID, ChannelName: c.Name}
		if a, ok := byChannel[c.ID]; ok {
			r.Automation = &a
		}
		out = append(out, r)
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /api/automations/{channelId}
func (h *AutomationsHandler) Get(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "channelId")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channelId")
		return
	}
	a, err := h.store.GetChannelAutomation(channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	logs, _ := h.store.ListAutoMatchLogsByChannel(channelID, 20)
	writeJSON(w, http.StatusOK, map[string]any{
		"automation": a,
		"logs":       logs,
	})
}

// GET /api/automations/{channelId}/preview
// Retorna os produtos que seriam disparados para este canal no próximo ciclo de auto-match.
func (h *AutomationsHandler) Preview(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "channelId")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channelId")
		return
	}

	auto, _ := h.store.GetChannelAutomation(channelID)
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}

	// Resolver parâmetros: canal > global
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

	channel, err := h.store.GetChannel(channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "canal nao encontrado")
		return
	}

	products, _ := h.store.ListCatalogProducts(50, 0, true)
	recentLogs, _ := h.store.ListAutoMatchLogsByChannel(channelID, 200)
	cutoff := time.Now().Add(-time.Duration(cooldownHours) * time.Hour)
	recentSet := make(map[int64]bool, len(recentLogs))
	for _, l := range recentLogs {
		if l.CreatedAt.After(cutoff) {
			recentSet[l.ProductID] = true
		}
	}

	type previewItem struct {
		ProductID   int64   `json:"product_id"`
		ProductName string  `json:"product_name"`
		Score       float64 `json:"score"`
		Price       float64 `json:"price,omitempty"`
		AlreadySent bool    `json:"already_sent"`
	}

	channels := []models.Channel{channel}
	var items []previewItem

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

		items = append(items, previewItem{
			ProductID:   p.ID,
			ProductName: p.CanonicalName,
			Score:       scores[0].Value,
			Price:       price,
			AlreadySent: recentSet[p.ID],
		})
	}

	if items == nil {
		items = []previewItem{}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Score > items[j].Score })
	if len(items) > 20 {
		items = items[:20]
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":       items,
		"threshold":   threshold,
		"max_per_run": maxPerRun,
	})
}

// PUT /api/automations/{channelId}
func (h *AutomationsHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "channelId")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channelId")
		return
	}
	var a models.ChannelAutomation
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a.ChannelID = channelID
	if a.MatchType == "" {
		a.MatchType = "all"
	}
	if a.CooldownHours <= 0 {
		a.CooldownHours = 6
	}
	if a.DropThreshold == 0 {
		a.DropThreshold = 0.10
	}
	if err := h.store.UpsertChannelAutomation(a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	saved, _ := h.store.GetChannelAutomation(channelID)
	writeJSON(w, http.StatusOK, saved)
}

// Advise POST /api/automations/{channelId}/advise
// Analisa logs recentes e sugere ajustes na automação via LLM com WebSearch.
func (h *AutomationsHandler) Advise(w http.ResponseWriter, r *http.Request) {
	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}

	channelID, ok := pathInt(r, "channelId")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	auto, err := h.store.GetChannelAutomation(channelID)
	if err != nil || auto == nil {
		writeErr(w, http.StatusNotFound, "automação não encontrada")
		return
	}

	ch, _ := h.store.GetChannel(channelID)

	// Logs recentes
	logs, _ := h.store.ListAutoMatchLogsByChannel(channelID, 50)
	scoreSum := 0.0
	for _, l := range logs {
		scoreSum += l.Score
	}
	avgScore := 0.0
	if len(logs) > 0 {
		avgScore = scoreSum / float64(len(logs))
	}

	threshold := 60.0
	if auto.Threshold.Valid {
		threshold = auto.Threshold.Float64
	}
	maxPerRun := int64(0)
	if auto.MaxPerRun.Valid {
		maxPerRun = auto.MaxPerRun.Int64
	}

	channelName := ""
	if ch.ID != 0 {
		channelName = ch.Name
	}

	snapshot := fmt.Sprintf(`Canal: %s
Auto-match habilitado: %v | Eventos habilitados: %v
Threshold atual: %.0f | Cooldown: %dh | Max/run: %d | DropThreshold: %.2f
Logs últimos %d disparos: score médio = %.1f`,
		channelName, auto.AutoMatchEnabled, auto.EventsEnabled,
		threshold, auto.CooldownHours, maxPerRun, auto.DropThreshold,
		len(logs), avgScore,
	)

	prompt := fmt.Sprintf(`Você é especialista em otimização de automações de afiliados WhatsApp/Telegram no Brasil.
Use a busca online para entender sazonalidade atual, tendências de e-commerce e melhores práticas para grupos de oferta.

ESTADO DA AUTOMAÇÃO:
%s

Analise e sugira ajustes concretos. Responda EXCLUSIVAMENTE em JSON:
{
  "summary": "diagnóstico geral em 1 frase",
  "suggestions": [
    {"field": "threshold", "current": "60", "recommended": "55", "reason": "..." }
  ]
}

Campos válidos: threshold, cooldown_hours, max_per_run, drop_threshold, auto_match_enabled, events_enabled.
Sugira somente o que faz sentido mudar — não preencha por preencher.`, snapshot)

	// Timeout 35s (Cloudflare corta em ~100s). WebSearch desligado pra evitar
	// inflar prompt + latência alta — análise é sobre dados internos, não tendências.
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   500,
		Temperature: 0.3,
		Operation:   "advise_automation",
		JSONMode:    true,
		WebSearch:   false,
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "LLM: "+err.Error())
		return
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		writeErr(w, http.StatusBadGateway, "LLM resposta inválida")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
