package admin

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
	"strings"
	"time"
)

// evolutionSender implementa MessageSender usando Evolution API diretamente.
type evolutionSender struct{ baseURL, apiKey, instance string }

func newEvolutionSender(baseURL, apiKey, instance string) *evolutionSender {
	return &evolutionSender{baseURL: baseURL, apiKey: apiKey, instance: instance}
}

func (e *evolutionSender) Provider() string { return "whatsapp" }

func (e *evolutionSender) SendText(ctx context.Context, chatID, text string) error {
	body := map[string]any{"number": chatID, "text": text}
	return e.post(ctx, "/message/sendText/"+e.instance, body)
}

func (e *evolutionSender) SendImage(ctx context.Context, chatID, imageURL, caption string) error {
	body := map[string]any{"number": chatID, "mediatype": "image", "media": imageURL, "caption": caption}
	return e.post(ctx, "/message/sendMedia/"+e.instance, body)
}

func (e *evolutionSender) post(ctx context.Context, path string, payload any) error {
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", e.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution %s: %d — %s", path, resp.StatusCode, string(b))
	}
	return nil
}

type ChannelsHandler struct {
	store    store.Store
	adapters pipeline.AdapterRegistry
}

func NewChannels(st store.Store, adapters pipeline.AdapterRegistry) *ChannelsHandler {
	return &ChannelsHandler{store: st, adapters: adapters}
}

func (h *ChannelsHandler) List(w http.ResponseWriter, r *http.Request) {
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	type channelView struct {
		models.Channel
		Targets []models.ChannelTarget `json:"targets"`
		Rules   []models.ChannelRule   `json:"rules"`
	}

	out := make([]channelView, 0, len(channels))
	for _, c := range channels {
		targets, _ := h.store.ListChannelTargets(c.ID)
		rules, _ := h.store.ListChannelRules(c.ID)
		out = append(out, channelView{Channel: c, Targets: targets, Rules: rules})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *ChannelsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	c, err := h.store.GetChannel(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	targets, _ := h.store.ListChannelTargets(id)
	if targets == nil {
		targets = []models.ChannelTarget{}
	}
	rules, _ := h.store.ListChannelRules(id)
	if rules == nil {
		rules = []models.ChannelRule{}
	}
	// Retorna flat (igual ao Python): channel fields + targets + rules no mesmo nível
	type channelFull struct {
		models.Channel
		Targets []models.ChannelTarget `json:"targets"`
		Rules   []models.ChannelRule   `json:"rules"`
	}
	writeJSON(w, http.StatusOK, channelFull{Channel: c, Targets: targets, Rules: rules})
}

type channelRequest struct {
	Name            string           `json:"name"             validate:"required"`
	Description     string           `json:"description"`
	Slug            *string          `json:"slug"`
	MessageTemplate *string          `json:"message_template"`
	SendStartHour   int              `json:"send_start_hour"`
	SendEndHour     int              `json:"send_end_hour"`
	DigestMode      bool             `json:"digest_mode"`
	DigestMaxItems  int              `json:"digest_max_items"`
	Active          bool             `json:"active"`
	Audience        *models.Audience `json:"audience"`
}

func (req channelRequest) toModel() models.Channel {
	c := models.Channel{
		Name:           req.Name,
		Description:    req.Description,
		SendStartHour:  req.SendStartHour,
		SendEndHour:    req.SendEndHour,
		DigestMode:     req.DigestMode,
		DigestMaxItems: req.DigestMaxItems,
		Active:         req.Active,
	}
	if req.Slug != nil {
		c.Slug = models.NullString{NullString: sql.NullString{String: *req.Slug, Valid: true}}
	}
	if req.MessageTemplate != nil {
		c.MessageTemplate = models.NullString{NullString: sql.NullString{String: *req.MessageTemplate, Valid: true}}
	}
	if req.Audience != nil {
		c.Audience = *req.Audience
	}
	if c.SendStartHour == 0 && c.SendEndHour == 0 {
		c.SendStartHour = 8
		c.SendEndHour = 22
	}
	if c.DigestMaxItems == 0 {
		c.DigestMaxItems = 5
	}
	return c
}

// Create cria um novo canal de notificação.
//
//	@Summary      Criar canal
//	@Description  Cria um canal de notificação (WhatsApp/Telegram) com regras de alerta.
//	@Tags         channels
//	@Accept       json
//	@Produce      json
//	@Param        body  body      channelRequest  true  "Dados do canal"
//	@Success      201   {object}  models.Channel
//	@Failure      400   {object}  object{error=string}
//	@Failure      500   {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/channels [post]
func (h *ChannelsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req channelRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	c := req.toModel()
	if c.Slug.Valid {
		if err := store.ValidSlug(c.Slug.String); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	id, err := h.store.CreateChannel(c)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	c.ID = id
	writeJSON(w, http.StatusCreated, c)
}

func (h *ChannelsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	// Carrega estado atual — merge com os campos enviados (evita sobrescrever com zero values)
	current, err := h.store.GetChannel(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	// Decodifica como mapa genérico para saber quais campos foram enviados
	var patch map[string]any
	if err := decodeBody(r, &patch); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	// Aplica apenas os campos presentes no body
	if v, ok := patch["name"].(string); ok {
		current.Name = v
	}
	if v, ok := patch["description"].(string); ok {
		current.Description = v
	}
	if v, ok := patch["active"].(bool); ok {
		current.Active = v
	}
	if v, ok := patch["digest_mode"].(bool); ok {
		current.DigestMode = v
	}
	if v, ok := patch["digest_max_items"].(float64); ok {
		current.DigestMaxItems = int(v)
	}
	if v, ok := patch["send_start_hour"].(float64); ok {
		current.SendStartHour = int(v)
	}
	if v, ok := patch["send_end_hour"].(float64); ok {
		current.SendEndHour = int(v)
	}
	if v, ok := patch["slug"].(string); ok {
		if err := store.ValidSlug(v); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		current.Slug = models.NullString{NullString: sql.NullString{String: v, Valid: true}}
	}
	if v, ok := patch["message_template"].(string); ok {
		current.MessageTemplate = models.NullString{NullString: sql.NullString{String: v, Valid: v != ""}}
	}
	if v, ok := patch["audience"]; ok {
		// Re-marshal the audience sub-object from the raw patch
		b, _ := json.Marshal(v)
		var aud models.Audience
		if err := json.Unmarshal(b, &aud); err == nil {
			current.Audience = aud
		}
	}
	if v, ok := patch["member_count"].(float64); ok {
		current.MemberCount = int64(v)
	}
	if v, ok := patch["ctr_30d"].(float64); ok {
		current.CTR30d = v
	}
	if v, ok := patch["cvr_30d"].(float64); ok {
		current.CVR30d = v
	}
	if v, ok := patch["revenue_30d"].(float64); ok {
		current.Revenue30d = v
	}

	if err := h.store.UpdateChannel(current); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, current)
}

func (h *ChannelsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteChannel(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type targetRequest struct {
	Provider  string  `json:"provider"`
	ChatID    string  `json:"chat_id"`
	Name      *string `json:"name"`
	InviteURL *string `json:"invite_url"`
	Status    string  `json:"status"`
}

func (h *ChannelsHandler) CreateTarget(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req targetRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t := models.ChannelTarget{
		ChannelID: channelID,
		Provider:  req.Provider,
		ChatID:    req.ChatID,
		Status:    req.Status,
	}
	if t.Status == "" {
		t.Status = "ok"
	}
	if req.Name != nil {
		t.Name = models.NullString{NullString: sql.NullString{String: *req.Name, Valid: true}}
	}
	if req.InviteURL != nil {
		t.InviteURL = models.NullString{NullString: sql.NullString{String: *req.InviteURL, Valid: true}}
	}
	tid, err := h.store.CreateChannelTarget(t)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	t.ID = tid
	writeJSON(w, http.StatusCreated, t)
}

func (h *ChannelsHandler) UpdateTarget(w http.ResponseWriter, r *http.Request) {
	_, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	targetID, ok := pathInt(r, "target_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid target id")
		return
	}
	var req targetRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t := models.ChannelTarget{
		ID:       targetID,
		Provider: req.Provider,
		ChatID:   req.ChatID,
		Status:   req.Status,
	}
	if req.Name != nil {
		t.Name = models.NullString{NullString: sql.NullString{String: *req.Name, Valid: true}}
	}
	if req.InviteURL != nil {
		t.InviteURL = models.NullString{NullString: sql.NullString{String: *req.InviteURL, Valid: true}}
	}
	if err := h.store.UpdateChannelTarget(t); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *ChannelsHandler) DeleteTarget(w http.ResponseWriter, r *http.Request) {
	targetID, ok := pathInt(r, "target_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid target id")
		return
	}
	if err := h.store.DeleteChannelTarget(targetID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type ruleRequest struct {
	MatchType     string   `json:"match_type"     validate:"required"`
	MatchValue    *string  `json:"match_value"`
	MaxPrice      *float64 `json:"max_price"`
	NotifyNew     bool     `json:"notify_new"`
	NotifyDrop    bool     `json:"notify_drop"`
	NotifyLowest  bool     `json:"notify_lowest"`
	DropThreshold float64  `json:"drop_threshold"`
	Active        bool     `json:"active"`
}

func (h *ChannelsHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req ruleRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	rule := models.ChannelRule{
		ChannelID:     channelID,
		MatchType:     req.MatchType,
		NotifyNew:     req.NotifyNew,
		NotifyDrop:    req.NotifyDrop,
		NotifyLowest:  req.NotifyLowest,
		DropThreshold: req.DropThreshold,
		Active:        req.Active,
	}
	if rule.DropThreshold == 0 {
		rule.DropThreshold = 0.10
	}
	if req.MatchValue != nil {
		rule.MatchValue = models.NullString{NullString: sql.NullString{String: *req.MatchValue, Valid: true}}
	}
	if req.MaxPrice != nil {
		rule.MaxPrice = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: *req.MaxPrice, Valid: true}}
	}
	rid, err := h.store.CreateChannelRule(rule)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	rule.ID = rid
	writeJSON(w, http.StatusCreated, rule)
}

// ListRules retorna todas as regras de um canal.
//
//	@Summary      Listar regras do canal
//	@Description  Retorna todas as regras (ChannelRule) do canal especificado.
//	@Tags         channels
//	@Produce      json
//	@Param        id   path      int  true  "Channel ID"
//	@Success      200  {array}   models.ChannelRule
//	@Failure      400  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/channels/{id}/rules [get]
func (h *ChannelsHandler) ListRules(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	rules, err := h.store.ListChannelRules(channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rules == nil {
		rules = []models.ChannelRule{}
	}
	writeJSON(w, http.StatusOK, rules)
}

func (h *ChannelsHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	ruleID, ok := pathInt(r, "rule_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid rule id")
		return
	}
	if err := h.store.DeleteChannelRule(ruleID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ChannelsHandler) UpdateRule(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	ruleID, ok := pathInt(r, "rule_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid rule id")
		return
	}
	var req ruleRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	rule := models.ChannelRule{
		ID:            ruleID,
		ChannelID:     channelID,
		MatchType:     req.MatchType,
		NotifyNew:     req.NotifyNew,
		NotifyDrop:    req.NotifyDrop,
		NotifyLowest:  req.NotifyLowest,
		DropThreshold: req.DropThreshold,
		Active:        req.Active,
	}
	if rule.DropThreshold == 0 {
		rule.DropThreshold = 0.10
	}
	if req.MatchValue != nil {
		rule.MatchValue = models.NullString{NullString: sql.NullString{String: *req.MatchValue, Valid: true}}
	}
	if req.MaxPrice != nil {
		rule.MaxPrice = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: *req.MaxPrice, Valid: true}}
	}
	if err := h.store.UpdateChannelRule(rule); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

// GetAudience retorna o perfil de audiência de um canal.
//
//	@Summary      Perfil de audiência
//	@Description  Retorna o perfil de audiência (audience JSONB) de um canal.
//	@Tags         channels
//	@Produce      json
//	@Param        id   path      int  true  "Channel ID"
//	@Success      200  {object}  models.Audience
//	@Failure      404  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/channels/{id}/audience [get]
func (h *ChannelsHandler) GetAudience(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	c, err := h.store.GetChannel(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "canal nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, c.Audience)
}

// GetMetrics retorna métricas de desempenho de um canal nos últimos 30 dias.
//
//	@Summary      Métricas do canal
//	@Description  Retorna CTR, CVR, receita e contagem de membros do canal.
//	@Tags         channels
//	@Produce      json
//	@Param        id      path      int     true   "Channel ID"
//	@Param        period  query     string  false  "Período (ex: 30d)"
//	@Success      200     {object}  object{ctr=number,cvr=number,revenue=number,member_count=integer}
//	@Failure      404     {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/channels/{id}/metrics [get]
func (h *ChannelsHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	c, err := h.store.GetChannel(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "canal nao encontrado")
		return
	}
	// Calcular métricas reais via store
	stats, _ := h.store.GetChannelStats(id)

	metrics := map[string]any{
		"ctr":                  c.CTR30d,
		"cvr":                  c.CVR30d,
		"revenue":              c.Revenue30d,
		"member_count":         c.MemberCount,
		"estimated_clicks":     stats.TotalClicks,
		"dispatches_7d":        stats.Dispatches7d,
		"product_count":        stats.ProductCount,
		"dispatches_7d_series": stats.Series,
	}
	writeJSON(w, http.StatusOK, metrics)
}

// SendDigest envia o digest consolidado do canal manualmente.
func (h *ChannelsHandler) SendDigest(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	ch, err := h.store.GetChannel(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	targets, _ := h.store.ListChannelTargets(id)

	maxItems := ch.DigestMaxItems
	if maxItems == 0 {
		maxItems = 5
	}
	// Busca os produtos do catálogo ordenados por preço
	catalog, _ := h.store.ListCatalogProducts(maxItems, 0, true)
	if len(catalog) == 0 {
		writeJSON(w, http.StatusOK, map[string]string{"status": "no products"})
		return
	}

	// AppConfig para affiliate tags e short links
	appCfg, _ := h.store.GetConfig()
	scheme := r.URL.Scheme; if scheme == "" { scheme = "https" }; publicURL := scheme + "://" + r.Host
	if publicURL == "://" {
		publicURL = "https://beta.autibequi.com"
	}

	// Monta mensagem digest
	channelName := ch.Name
	if channelName == "" {
		channelName = "Snatcher"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("🔥 *Top %d ofertas — %s*\n\n", len(catalog), channelName))
	for i, p := range catalog {
		price := 0.0
		if p.LowestPrice.Valid {
			price = p.LowestPrice.Float64
		}
		rawURL := ""
		if p.LowestPriceURL.Valid {
			rawURL = p.LowestPriceURL.String
		}
		source := ""
		if p.LowestPriceSource.Valid {
			source = p.LowestPriceSource.String
		}
		// Usa short link se configurado, senão affiliate direto
		shortID := h.store.GetShortIDByURL(rawURL)
		finalURL := buildProductURL(rawURL, source, shortID, publicURL, appCfg, h.store)
		sb.WriteString(fmt.Sprintf("%d. *%s*\n💰 R$ %.2f\n🔗 %s\n\n", i+1, p.CanonicalName, price, finalURL))
	}
	msg := sb.String()

	cfg, _ := h.store.GetConfig()
	waAccounts, _ := h.store.ListWAAccounts()

	sent := 0
	for _, target := range targets {
		if target.Status != "ok" {
			continue
		}
		adapter, accountID, platform, ok := h.resolveAdapterWithAccount(target, cfg, waAccounts)
		if !ok || adapter == nil {
			continue
		}

		// Check throttle before sending
		if platform == "whatsapp" && accountID > 0 {
			if err := h.store.CheckAndIncrementWA(accountID); err != nil {
				slog.Warn("throttle blocked send", "account", accountID, "platform", "whatsapp", "err", err)
				continue
			}
		} else if platform == "telegram" && accountID > 0 {
			if err := h.store.CheckAndIncrementTG(accountID); err != nil {
				slog.Warn("throttle blocked send", "account", accountID, "platform", "telegram", "err", err)
				continue
			}
		}

		if err := adapter.SendText(r.Context(), target.ChatID, msg); err == nil {
			sent++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "sent", "targets": sent, "products": len(catalog)})
}

// SendProduct envia um produto específico manualmente para todos os targets do canal.
func (h *ChannelsHandler) SendProduct(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		ProductID int64 `json:"product_id"`
	}
	if err := decodeBody(r, &body); err != nil || body.ProductID == 0 {
		writeErr(w, http.StatusBadRequest, "product_id required")
		return
	}

	targets, _ := h.store.ListChannelTargets(channelID)
	ch, _ := h.store.GetChannel(channelID)
	p, err := h.store.GetCatalogProduct(body.ProductID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "product not found")
		return
	}

	tpl := "🔥 *{title}*\n💰 R$ {price}\n🔗 {url}"
	if ch.MessageTemplate.Valid && ch.MessageTemplate.String != "" {
		tpl = ch.MessageTemplate.String
	}
	price := 0.0
	if p.LowestPrice.Valid {
		price = p.LowestPrice.Float64
	}
	rawURL := ""
	source := ""
	if p.LowestPriceURL.Valid {
		rawURL = p.LowestPriceURL.String
	}
	if p.LowestPriceSource.Valid {
		source = p.LowestPriceSource.String
	}
	cfg, _ := h.store.GetConfig()
	scheme := r.URL.Scheme; if scheme == "" { scheme = "https" }; publicURL := scheme + "://" + r.Host
	if publicURL == "://" {
		publicURL = "https://beta.autibequi.com"
	}
	shortID := h.store.GetShortIDByURL(rawURL)
	finalURL := buildProductURL(rawURL, source, shortID, publicURL, cfg, h.store)
	msg := strings.NewReplacer(
		"{title}", p.CanonicalName,
		"{price:.2f}", fmt.Sprintf("%.2f", price),
		"{price}", fmt.Sprintf("%.2f", price),
		"{url}", finalURL,
	).Replace(tpl)

	waAccounts, _ := h.store.ListWAAccounts()

	sent := 0
	for _, target := range targets {
		if target.Status != "ok" {
			continue
		}
		adapter, accountID, platform, ok := h.resolveAdapterWithAccount(target, cfg, waAccounts)
		if !ok || adapter == nil {
			continue
		}

		// Check throttle before sending
		if platform == "whatsapp" && accountID > 0 {
			if err := h.store.CheckAndIncrementWA(accountID); err != nil {
				slog.Warn("throttle blocked send", "account", accountID, "platform", "whatsapp", "err", err)
				continue
			}
		} else if platform == "telegram" && accountID > 0 {
			if err := h.store.CheckAndIncrementTG(accountID); err != nil {
				slog.Warn("throttle blocked send", "account", accountID, "platform", "telegram", "err", err)
				continue
			}
		}

		var sendErr error
		if p.ImageURL.Valid && p.ImageURL.String != "" {
			sendErr = adapter.SendImage(r.Context(), target.ChatID, p.ImageURL.String, msg)
		} else {
			sendErr = adapter.SendText(r.Context(), target.ChatID, msg)
		}
		if sendErr == nil {
			sent++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "sent", "targets": sent})
}

// buildProductURL retorna URL com short link ou affiliate direto.
func buildProductURL(rawURL, source, shortID, publicBaseURL string, cfg models.AppConfig, st store.Store) string {
	if cfg.UseShortLinks && shortID != "" && publicBaseURL != "" {
		return publicBaseURL + "/v/" + shortID
	}
	return applyAffiliateURL(rawURL, source, st)
}

// applyAffiliateURL adiciona parâmetros de afiliado na URL baseado no source.
func applyAffiliateURL(rawURL, source string, st store.Store) string {
	if st == nil {
		return rawURL
	}

	switch source {
	case "amazon":
		aff, found, _ := st.GetAffiliateBySource("amz")
		if found && aff.TrackingID != "" {
			if strings.Contains(rawURL, "?") {
				return rawURL + "&tag=" + aff.TrackingID
			}
			return rawURL + "?tag=" + aff.TrackingID
		}
	case "mercadolivre":
		aff, found, _ := st.GetAffiliateBySource("ml")
		if found && aff.TrackingID != "" {
			sep := "?"
			if strings.Contains(rawURL, "?") {
				sep = "&"
			}
			return rawURL + sep + "matt_tool=" + aff.TrackingID + "&matt_source=affiliate"
		}
	}
	return rawURL
}

// resolveAdapterWithAccount returns both the adapter and the account ID used.
// Returns (adapter, accountID, platform, ok). For non-WA platforms, accountID is 0.
func (h *ChannelsHandler) resolveAdapterWithAccount(target models.ChannelTarget, cfg models.AppConfig, waAccounts []models.WAAccount) (pipeline.MessageSender, int64, string, bool) {
	if target.Provider == "whatsapp" {
		// Usa a primeira conta WA ativa com URL configurada
		for _, acc := range waAccounts {
			if !acc.Active || !acc.BaseURL.Valid || acc.BaseURL.String == "" {
				continue
			}
			apiKey := acc.APIKey.String
			if !acc.APIKey.Valid {
				apiKey = cfg.WAApiKey.String
			}
			instance := acc.Instance.String
			if !acc.Instance.Valid {
				instance = cfg.WAInstance.String
			}
			return newEvolutionSender(acc.BaseURL.String, apiKey, instance), acc.ID, "whatsapp", true
		}
		// Fallback: AppConfig global (no specific account)
		if cfg.WABaseURL.Valid {
			return newEvolutionSender(
				cfg.WABaseURL.String,
				cfg.WAApiKey.String,
				cfg.WAInstance.String,
			), 0, "whatsapp", true
		}
	}
	// Telegram ou outros — usa adapter registrado
	if a, ok := h.adapters[target.Provider]; ok {
		return a, 0, target.Provider, true
	}
	return nil, 0, "", false
}

// resolveAdapter cria um adapter dinâmico para o target usando a conta WA correta.
func (h *ChannelsHandler) resolveAdapter(target models.ChannelTarget, cfg models.AppConfig, waAccounts []models.WAAccount) pipeline.MessageSender {
	if target.Provider == "whatsapp" {
		// Usa a primeira conta WA ativa com URL configurada
		for _, acc := range waAccounts {
			if !acc.Active || !acc.BaseURL.Valid || acc.BaseURL.String == "" {
				continue
			}
			apiKey := acc.APIKey.String
			if !acc.APIKey.Valid {
				apiKey = cfg.WAApiKey.String
			}
			instance := acc.Instance.String
			if !acc.Instance.Valid {
				instance = cfg.WAInstance.String
			}
			return newEvolutionSender(acc.BaseURL.String, apiKey, instance)
		}
		// Fallback: AppConfig global
		if cfg.WABaseURL.Valid {
			return newEvolutionSender(
				cfg.WABaseURL.String,
				cfg.WAApiKey.String,
				cfg.WAInstance.String,
			)
		}
	}
	// Telegram ou outros — usa adapter registrado
	if a, ok := h.adapters[target.Provider]; ok {
		return a
	}
	return nil
}

// GetHistory retorna os disparos recentes do canal (via grupos associados).
func (h *ChannelsHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	entries, err := h.store.ListChannelDispatchHistory(id, 50)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar histórico")
		return
	}
	if entries == nil {
		entries = []models.ChannelHistoryEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}
