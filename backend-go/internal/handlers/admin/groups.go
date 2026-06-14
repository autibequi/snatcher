package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"snatcher/backendv2/internal/services/invitelinks"
	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/messaging"
	groupssvc "snatcher/backendv2/internal/services/groups"
	"snatcher/backendv2/internal/models"
	store "snatcher/backendv2/internal/repositories"
)

type GroupsHandler struct {
	store       store.Store
	llmFn       func() llm.Client
	// msgRegistry mantém o registry pluggável WA/TG; Evolution-specific ops usam evoClient internamente.
	msgRegistry *messaging.Registry
	// groupsSvc encapsula a lógica de negócio de enriquecimento de grupos.
	groupsSvc   *groupssvc.Service
}

// NewGroupsHandler cria um GroupsHandler com store e registry de mensageria.
func NewGroupsHandler(st store.Store, reg *messaging.Registry) *GroupsHandler {
	return &GroupsHandler{
		store:       st,
		msgRegistry: reg,
		groupsSvc:   groupssvc.New(st),
	}
}

func (h *GroupsHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }

type groupRequest struct {
	ChannelID   *int64  `json:"channel_id,omitempty"`
	Name        string  `json:"name"         validate:"required"`
	Platform    string  `json:"platform"     validate:"required,oneof=whatsapp telegram"`
	WAAccountID *int64  `json:"wa_account_id"`
	TGAccountID *int64  `json:"tg_account_id"`
	// AccountID: alias aceito pela UI antiga ao vincular WA no detalhe do canal (equivalente a wa_account_id).
	AccountID  *int64 `json:"account_id"`
	InviteLink  string `json:"invite_link"`
	JID         string `json:"jid"`
	Status      string `json:"status"`
	DailyMsgCap *int   `json:"daily_msg_cap"`
}

// groupEnriched estende RedesignGroup com campos calculados para o redesign.
type groupEnriched struct {
	models.RedesignGroup
	ChannelName          string `json:"channel_name"`
	AccountLabel         string `json:"account_label"`
	AdminCount           int    `json:"admin_count"`
	VerifiedAdminCount   int    `json:"verified_admin_count"` // admins cadastrados que a Evolution reporta como admin no grupo
	AudienceStatus       string `json:"audience_status"`      // "perfil" | "sem_perfil"
	ChannelsCount        int    `json:"channels_count"`       // linhas com o mesmo JID (grupo físico em N canais)
}

// Cache curto por instância WA — fetchAllGroups com participantes é pesado.
var waFetchAllGroupsCache sync.Map // key: cred key → cachedFetchAll

type cachedFetchAll struct {
	at     time.Time
	groups []map[string]any
}

func (h *GroupsHandler) List(w http.ResponseWriter, r *http.Request) {
	channelID := int64(0)
	if v := r.URL.Query().Get("channelId"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			channelID = n
		}
	}
	platform := r.URL.Query().Get("platform")
	status := r.URL.Query().Get("status")

	groups, err := h.store.ListRedesignGroups(channelID, platform, status)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar grupos")
		return
	}
	if groups == nil {
		groups = []models.RedesignGroup{}
	}

	out := make([]groupEnriched, 0, len(groups))
	for _, g := range groups {
		// Listagem vem só do Postgres — não consultar Evolution aqui (fetchAllGroups é pesado e
		// bloqueava a tab Grupos do canal). Verificação WA vs admins cadastrados fica em GET /:id.
		out = append(out, h.enrichRedesignGroup(r.Context(), g, false))
	}
	writeJSON(w, http.StatusOK, out)
}

// enrichRedesignGroup agrega channel_name, account_label, admin_count, verified_admin_count, audience_status.
// Delega ao groupsSvc (lógica de negócio) e converte para o tipo local groupEnriched.
// evolutionVerify: quando true (detalhe do grupo), cruza admins com participantes da Evolution; na listagem use false.
func (h *GroupsHandler) enrichRedesignGroup(ctx context.Context, g models.RedesignGroup, evolutionVerify bool) groupEnriched {
	var verifier groupssvc.EvolutionVerifier = groupssvc.NopEvolutionVerifier{}
	if evolutionVerify {
		verifier = &handlerEvolutionVerifier{h: h}
	}
	e := h.groupsSvc.EnrichGroup(ctx, g, evolutionVerify, verifier)
	return groupEnriched{
		RedesignGroup:      e.RedesignGroup,
		ChannelName:        e.ChannelName,
		AccountLabel:       e.AccountLabel,
		AdminCount:         e.AdminCount,
		VerifiedAdminCount: e.VerifiedAdminCount,
		AudienceStatus:     e.AudienceStatus,
		ChannelsCount:      e.ChannelsCount,
	}
}

// handlerEvolutionVerifier adapta countVerifiedWAAdmins do handler para a interface EvolutionVerifier.
type handlerEvolutionVerifier struct{ h *GroupsHandler }

func (v *handlerEvolutionVerifier) CountVerifiedAdmins(ctx context.Context, g models.RedesignGroup) (int, error) {
	return v.h.countVerifiedWAAdmins(ctx, g)
}

func (h *GroupsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, h.enrichRedesignGroup(r.Context(), g, true))
}

func duplicateGroupMessage(candidate models.RedesignGroup) string {
	if candidate.ChannelID.Valid {
		return "ja existe um grupo com este JID neste canal"
	}
	if candidate.WAAccountID.Valid && candidate.Platform == "whatsapp" {
		return "este grupo ja foi importado nesta conta WhatsApp"
	}
	if candidate.TGAccountID.Valid && candidate.Platform == "telegram" {
		return "este grupo ja foi importado nesta conta Telegram"
	}
	return "ja existe um grupo com este identificador"
}

func (h *GroupsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req groupRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	req.JID = strings.TrimSpace(req.JID)
	// WhatsApp exige JID de grupo real (@g.us). Sem JID, a checagem de duplicata não casa
	// (jid NULL nunca bate em SQL) e abre brecha para grupos fantasma e duplicados via retry
	// de import. Placeholders/seeds entram só via migration, não por este handler.
	if req.Platform == "whatsapp" && !strings.HasSuffix(req.JID, "@g.us") {
		writeErr(w, http.StatusUnprocessableEntity, "grupo WhatsApp exige JID de grupo real (@g.us) — importe via Contas → WhatsApp")
		return
	}
	if req.WAAccountID == nil && req.AccountID != nil && *req.AccountID != 0 && req.Platform == "whatsapp" {
		req.WAAccountID = req.AccountID
	}
	invite := req.InviteLink
	if invite != "" && req.Platform == "whatsapp" {
		invite = invitelinks.NormalizeWhatsAppInvite(invite)
	}
	var chID models.NullInt64
	if req.ChannelID != nil && *req.ChannelID != 0 {
		chID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.ChannelID, Valid: true}}
	}
	// Cap diário: default 10 quando não informado — cap 0 bloqueia silenciosamente
	// o dispatch (ShouldEnqueueGroup retorna false p/ cap<=0).
	dailyCap := 10
	if req.DailyMsgCap != nil && *req.DailyMsgCap > 0 {
		dailyCap = *req.DailyMsgCap
	}
	g := models.RedesignGroup{
		ChannelID:   chID,
		Name:        req.Name,
		Platform:    req.Platform,
		InviteLink:  models.NullString{NullString: sql.NullString{String: invite, Valid: invite != ""}},
		JID:         models.NullString{NullString: sql.NullString{String: req.JID, Valid: req.JID != ""}},
		Status:      "active",
		DailyMsgCap: dailyCap,
		Overrides:   []byte("{}"),
	}
	if req.Status != "" {
		g.Status = req.Status
	}
	if req.WAAccountID != nil {
		g.WAAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.WAAccountID, Valid: true}}
	}
	if req.TGAccountID != nil {
		g.TGAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.TGAccountID, Valid: true}}
	}
	dup, cerr := h.store.FindConflictingRedesignGroup(g, 0)
	if cerr != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao verificar duplicata")
		return
	}
	// Import idempotente: o front reenvia o POST em retry de timeout (até 2x). Se o grupo já
	// existe (mesmo platform+jid), devolve o existente em vez de 409 — assim o retry não duplica.
	if dup != nil {
		writeJSON(w, http.StatusOK, dup)
		return
	}
	id, err := h.store.CreateRedesignGroup(g)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar grupo")
		return
	}
	g.ID = id

	// Auto-vincula a conta como admin do grupo (group_admins) quando uma conta foi
	// informada — fecha o gate HasModem do selection.tick. Sem isso, um grupo
	// importado com wa_account_id nascia sem admin e nunca disparava (gap descoberto
	// ao configurar os grupos Snatcher). Best-effort: não falha o create se errar.
	if req.WAAccountID != nil && *req.WAAccountID != 0 {
		if _, aerr := h.store.AddGroupAdmin(models.GroupAdmin{
			GroupID: id, AccountID: *req.WAAccountID, AccountType: "wa",
		}); aerr != nil {
			slog.Warn("Create group: falha ao auto-vincular group_admin", "group_id", id, "account_id", *req.WAAccountID, "err", aerr)
		}
	} else if req.TGAccountID != nil && *req.TGAccountID != 0 {
		if _, aerr := h.store.AddGroupAdmin(models.GroupAdmin{
			GroupID: id, AccountID: *req.TGAccountID, AccountType: "tg",
		}); aerr != nil {
			slog.Warn("Create group: falha ao auto-vincular group_admin", "group_id", id, "account_id", *req.TGAccountID, "err", aerr)
		}
	}

	writeJSON(w, http.StatusCreated, g)
}

// parsePatchChannelID lê channel_id ou channelId no PATCH (JSON number, string ou null).
func parsePatchChannelID(patch map[string]any) (setID int64, clear bool, found bool, err error) {
	var raw any
	if r, ok := patch["channel_id"]; ok {
		raw = r
		found = true
	} else if r, ok := patch["channelId"]; ok {
		raw = r
		found = true
	}
	if !found {
		return 0, false, false, nil
	}
	if raw == nil {
		return 0, true, true, nil
	}
	switch v := raw.(type) {
	case float64:
		n := int64(v)
		if n <= 0 {
			return 0, true, true, nil
		}
		return n, false, true, nil
	case string:
		s := strings.TrimSpace(v)
		if s == "" || s == "0" {
			return 0, true, true, nil
		}
		n, e := strconv.ParseInt(s, 10, 64)
		if e != nil {
			return 0, false, true, e
		}
		if n <= 0 {
			return 0, true, true, nil
		}
		return n, false, true, nil
	case json.Number:
		n, e := v.Int64()
		if e != nil {
			return 0, false, true, e
		}
		if n <= 0 {
			return 0, true, true, nil
		}
		return n, false, true, nil
	default:
		return 0, false, true, fmt.Errorf("tipo channel_id invalido")
	}
}

func (h *GroupsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	existing, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}

	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	if v, ok := patch["name"].(string); ok && v != "" {
		// Nome de grupos WhatsApp só deve ser persistido após POST .../propagate-subject
		// (atualiza Evolution + DB). PATCH ignorado para não divergir do título real no WA.
		if existing.Platform != "whatsapp" {
			existing.Name = v
		}
	}
	if v, ok := patch["status"].(string); ok && v != "" {
		existing.Status = v
	}
	if v, ok := patch["platform"].(string); ok && v != "" {
		existing.Platform = v
	}
	if v, ok := patch["invite_link"].(string); ok {
		norm := v
		if norm != "" && existing.Platform == "whatsapp" {
			norm = invitelinks.NormalizeWhatsAppInvite(norm)
		}
		existing.InviteLink = models.NullString{NullString: sql.NullString{String: norm, Valid: norm != ""}}
	}
	if v, ok := patch["jid"].(string); ok {
		v = strings.TrimSpace(v)
		ns := models.NullString{NullString: sql.NullString{String: v, Valid: v != ""}}
		existing.JID = ns
	}
	if v, ok := patch["member_count"].(float64); ok {
		existing.MemberCount = int64(v)
	}
	if v, ok := patch["wa_account_id"].(float64); ok {
		existing.WAAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: int64(v), Valid: true}}
	}
	if v, ok := patch["tg_account_id"].(float64); ok {
		existing.TGAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: int64(v), Valid: true}}
	}
	if v, ok := patch["daily_msg_cap"].(float64); ok && v >= 0 {
		existing.DailyMsgCap = int(v)
	}
	if setID, clear, found, perr := parsePatchChannelID(patch); found {
		if perr != nil {
			writeErr(w, http.StatusBadRequest, "channel_id invalido")
			return
		}
		if clear {
			existing.ChannelID = models.NullInt64{}
		} else {
			existing.ChannelID = models.NullInt64{NullInt64: sql.NullInt64{Int64: setID, Valid: true}}
		}
	}

	if dup, cerr := h.store.FindConflictingRedesignGroup(existing, id); cerr != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao verificar duplicata")
		return
	} else if dup != nil {
		writeErr(w, http.StatusConflict, duplicateGroupMessage(existing))
		return
	}

	if err := h.store.UpdateRedesignGroup(existing); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar grupo")
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (h *GroupsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteRedesignGroup(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar grupo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/groups/:id/members
// WhatsApp: participantes reais via Evolution (fetchAllGroups + participantes).
// Engajamento/clicks por membro continua pendente de tabela — vem 0.
func (h *GroupsHandler) Members(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	group, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}

	type Member struct {
		JID         string `json:"jid"`
		Name        string `json:"name"`
		Phone       string `json:"phone,omitempty"`
		Clicks30d   int    `json:"clicks_30d"`
		LastClickAt string `json:"last_click_at,omitempty"`
		Role        string `json:"role"` // admin | member — papel no grupo WA quando disponível
		Engagement  string `json:"engagement,omitempty"`
	}

	if group.Platform != "whatsapp" || !group.JID.Valid || group.JID.String == "" {
		writeJSON(w, http.StatusOK, []Member{})
		return
	}

	cfg, _ := h.store.GetConfig()
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		writeJSON(w, http.StatusOK, []Member{})
		return
	}

	evo := &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
	participantMaps, findErr := evo.findGroupParticipants(r.Context(), group.JID.String)
	if findErr != nil || len(participantMaps) == 0 {
		groups, ferr := h.fetchAllGroupsWithParticipantsCached(r.Context(), baseURL, apiKey, instance)
		if ferr != nil {
			if findErr != nil {
				writeErr(w, http.StatusBadGateway, "evolution participantes: "+findErr.Error())
				return
			}
			writeErr(w, http.StatusBadGateway, "evolution: "+ferr.Error())
			return
		}
		gmeta := findGroupMetaByJID(groups, group.JID.String)
		participantMaps = nil
		if gmeta != nil {
			participantMaps = evolutionParticipantMaps(gmeta)
		}
	}
	if participantMaps == nil {
		participantMaps = []map[string]any{}
	}

	members := make([]Member, 0, len(participantMaps))
	for _, pm := range participantMaps {
		jid := participantJID(pm)
		if jid == "" {
			continue
		}
		name, _ := pm["name"].(string)
		if name == "" {
			name, _ = pm["pushName"].(string)
		}
		role := "member"
		if participantIsGroupAdmin(pm) {
			role = "admin"
		}
		phone := jidDigits(jid)
		members = append(members, Member{
			JID:        jid,
			Name:       name,
			Phone:      phone,
			Clicks30d:  0,
			Role:       role,
			Engagement: memberRole(0),
		})
	}

	sort.Slice(members, func(i, j int) bool {
		return members[i].JID < members[j].JID
	})

	writeJSON(w, http.StatusOK, members)
}

// memberRole classifica o membro com base nos clicks dos últimos 30 dias.
func memberRole(clicks30d int) string {
	switch {
	case clicks30d >= 25:
		return "engajado"
	case clicks30d >= 1:
		return "ativo"
	default:
		return "dormente"
	}
}

// Archive alterna o campo archived do grupo e opcionalmente seta last_error.
//
// POST /api/groups/{id}/archive
// Body: { "archived": bool, "error"?: string }
func (h *GroupsHandler) Archive(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.store.GetRedesignGroup(id); err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}

	var req struct {
		Archived bool    `json:"archived"`
		Error    *string `json:"error"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	if err := h.store.SetGroupArchived(id, req.Archived, req.Error); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar grupo")
		return
	}

	g, _ := h.store.GetRedesignGroup(id)
	writeJSON(w, http.StatusOK, g)
}

// ListAdmins retorna os administradores de um grupo.
//
// GET /api/groups/{id}/admins
func (h *GroupsHandler) ListAdmins(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.store.GetRedesignGroup(id); err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}
	admins, err := h.store.ListGroupAdmins(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar admins")
		return
	}
	writeJSON(w, http.StatusOK, admins)
}

// AddAdmin adiciona um administrador a um grupo.
//
// POST /api/groups/{id}/admins
// Body: { "account_type": "wa"|"tg", "account_id": int }
func (h *GroupsHandler) AddAdmin(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}

	var req struct {
		AccountType string `json:"account_type" validate:"required,oneof=wa tg"`
		AccountID   int64  `json:"account_id"   validate:"required"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}

	adminID, err := h.store.AddGroupAdmin(models.GroupAdmin{
		GroupID:     id,
		AccountType: req.AccountType,
		AccountID:   req.AccountID,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao adicionar admin")
		return
	}

	// Promoção a admin no WhatsApp real é best-effort e assíncrona: as chamadas à Evolution
	// (add + promote participante) demoram e estouravam o timeout do proxy → 502, deixando o
	// vínculo sem gravar. O registro em group_admins acima é o que o disparo precisa; a promoção
	// roda em background com seu próprio contexto e, se falhar, apenas loga (pode ser refeita).
	if req.AccountType == "wa" && g.Platform == "whatsapp" && g.JID.Valid && g.JID.String != "" && g.WAAccountID.Valid {
		cfg, _ := h.store.GetConfig()
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if errWA := h.promoteWAAccountAsGroupAdmin(ctx, g, req.AccountID, cfg); errWA != nil {
				slog.Warn("promoteWAAccountAsGroupAdmin best-effort falhou", "group_id", id, "account_id", req.AccountID, "err", errWA)
			}
		}()
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":           adminID,
		"group_id":     id,
		"account_type": req.AccountType,
		"account_id":   req.AccountID,
	})
}

// PropagateSubject POST /api/groups/{id}/propagate-subject
// Body: { "subject": "novo nome" } — aplica no WhatsApp via Evolution e persiste em groups.name.
func (h *GroupsHandler) PropagateSubject(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}
	if g.Platform != "whatsapp" {
		writeErr(w, http.StatusBadRequest, "apenas grupos WhatsApp")
		return
	}
	if !g.JID.Valid || g.JID.String == "" || !g.WAAccountID.Valid {
		writeErr(w, http.StatusUnprocessableEntity, "grupo sem JID ou sem conta WA")
		return
	}
	var body struct {
		Subject string `json:"subject"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Subject) == "" {
		writeErr(w, http.StatusBadRequest, "subject obrigatorio")
		return
	}
	subject := strings.TrimSpace(body.Subject)

	cfg, _ := h.store.GetConfig()
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		writeErr(w, http.StatusServiceUnavailable, "Evolution nao configurada")
		return
	}
	evo := &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
	if err := evo.updateGroupSubject(r.Context(), g.JID.String, subject); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	g.Name = subject
	if err := h.store.UpdateRedesignGroup(g); err != nil {
		writeErr(w, http.StatusInternalServerError, "nome aplicado no WA mas falhou ao salvar no banco")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// DeleteAdmin remove um administrador de um grupo.
//
// DELETE /api/groups/{id}/admins/{adminId}
func (h *GroupsHandler) DeleteAdmin(w http.ResponseWriter, r *http.Request) {
	_, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid group id")
		return
	}
	adminIDStr := chi.URLParam(r, "adminId")
	adminID, err := strconv.ParseInt(adminIDStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid admin id")
		return
	}
	if err := h.store.DeleteGroupAdmin(adminID); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover admin")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SuggestAudience POST /api/groups/{id}/suggest-audience
// Infere perfil da audiência via LLM com WebSearch (tendências reais).
func (h *GroupsHandler) SuggestAudience(w http.ResponseWriter, r *http.Request) {
	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	g, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo não encontrado")
		return
	}

	channelName := ""

	prompt := fmt.Sprintf(`Você é especialista em audiências de grupos WhatsApp/Telegram de ofertas brasileiros.

Use a busca online para investigar:
- Padrão típico de membros em grupos com nomes similares
- Faixa etária dominante e horários de maior engajamento
- Categorias de produto que mais convertem nesta audiência

GRUPO:
- Nome: "%s"
- Plataforma: %s
- Canal pai: "%s"
- Membros: %d

Responda EXCLUSIVAMENTE em JSON:
{
  "audience_summary": "descrição em 1-2 frases do perfil predominante",
  "age_range": "ex: 25-40",
  "peak_hours": "ex: 19h-22h em dias de semana",
  "interests": ["interesse1", "interesse2", "interesse3"],
  "best_categories": ["categoria1", "categoria2"],
  "engagement_tip": "1 dica concreta para maximizar conversão neste grupo"
}`,
		g.Name, g.Platform, channelName, g.MemberCount,
	)

	// Timeout 45s (Cloudflare corta em ~100s) — WebSearch ativo é mais lento.
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   500,
		Temperature: 0.4,
		Operation:   "suggest_audience",
		JSONMode:    true,
		WebSearch:   true,
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

// FetchInvite POST /api/groups/{id}/fetch-invite
// Busca o invite link do grupo via Evolution API e atualiza o registro.
func (h *GroupsHandler) FetchInvite(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo não encontrado")
		return
	}
	if g.Platform != "whatsapp" {
		writeErr(w, http.StatusBadRequest, "apenas grupos WhatsApp suportam fetch automático")
		return
	}
	if !g.JID.Valid || g.JID.String == "" {
		writeErr(w, http.StatusUnprocessableEntity, "grupo sem JID — importe via Contas → WhatsApp para preencher")
		return
	}
	if !g.WAAccountID.Valid {
		writeErr(w, http.StatusUnprocessableEntity, "grupo sem conta WhatsApp vinculada")
		return
	}
	cfg, _ := h.store.GetConfig()
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		writeErr(w, http.StatusServiceUnavailable, "Evolution não configurada")
		return
	}

	evo := &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
	link, err := evo.getGroupInviteCode(r.Context(), g.JID.String)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "falha Evolution: "+err.Error())
		return
	}

	link = invitelinks.NormalizeWhatsAppInvite(link)
	g.InviteLink = models.NullString{NullString: sql.NullString{String: link, Valid: true}}
	if err := h.store.UpdateRedesignGroup(g); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invite_link": link, "updated": true})
}

// --- Evolution helpers (WhatsApp grupos) -------------------------------------

// resolveEvolutionCredentials retorna as credenciais Evolution globais do appconfig.
// F08b: credenciais per-account (waaccount.base_url/api_key/instance) removidas;
// Evolution é global — configurada em appconfig.
func resolveEvolutionCredentials(cfg models.AppConfig) (baseURL, apiKey, instance string) {
	if cfg.WABaseURL.Valid {
		baseURL = cfg.WABaseURL.String
	}
	if cfg.WAApiKey.Valid {
		apiKey = cfg.WAApiKey.String
	}
	if cfg.WAInstance.Valid {
		instance = cfg.WAInstance.String
	}
	return
}

func (h *GroupsHandler) fetchAllGroupsWithParticipantsCached(ctx context.Context, baseURL, apiKey, instance string) ([]map[string]any, error) {
	apKeyShort := apiKey
	if len(apKeyShort) > 12 {
		apKeyShort = apKeyShort[:12]
	}
	key := baseURL + "|" + apKeyShort + "|" + instance
	if v, ok := waFetchAllGroupsCache.Load(key); ok {
		c := v.(cachedFetchAll)
		if time.Since(c.at) < 45*time.Second && len(c.groups) > 0 {
			return c.groups, nil
		}
	}
	evo := &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
	groups, err := evo.getGroups(ctx)
	if err != nil {
		return nil, err
	}
	waFetchAllGroupsCache.Store(key, cachedFetchAll{at: time.Now(), groups: groups})
	return groups, nil
}

func findGroupMetaByJID(groups []map[string]any, jid string) map[string]any {
	want := strings.TrimSpace(strings.ToLower(jid))
	for _, g := range groups {
		gid, _ := g["id"].(string)
		if gid == "" {
			gid, _ = g["groupJid"].(string)
		}
		gid = strings.TrimSpace(strings.ToLower(gid))
		if gid != "" && (gid == want || stripJIDSuffix(gid) == stripJIDSuffix(want)) {
			return g
		}
	}
	return nil
}

func stripJIDSuffix(j string) string {
	j = strings.TrimSpace(strings.ToLower(j))
	if i := strings.Index(j, "@"); i > 0 {
		return j[:i]
	}
	return j
}

func evolutionParticipantMaps(gmeta map[string]any) []map[string]any {
	var raw []any
	if r, ok := gmeta["participants"].([]any); ok && len(r) > 0 {
		raw = r
	} else if r, ok := gmeta["Participants"].([]any); ok && len(r) > 0 {
		raw = r
	}
	if len(raw) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, p := range raw {
		pm, ok := p.(map[string]any)
		if ok {
			out = append(out, pm)
		}
	}
	return out
}

func participantJID(pm map[string]any) string {
	for _, k := range []string{"id", "jid"} {
		if s, ok := pm[k].(string); ok {
			s = strings.TrimSpace(s)
			if s != "" {
				return s
			}
		}
	}
	return ""
}

func jidDigits(jid string) string {
	s := strings.TrimSpace(jid)
	if i := strings.Index(s, "@"); i > 0 {
		s = s[:i]
	}
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func participantIsGroupAdmin(pm map[string]any) bool {
	if v, ok := pm["admin"].(bool); ok && v {
		return true
	}
	if s, ok := pm["admin"].(string); ok && s != "" && s != "false" {
		return true
	}
	if r, ok := pm["rank"].(string); ok {
		switch strings.ToLower(r) {
		case "admin", "superadmin", "super_admin":
			return true
		}
	}
	return false
}

func phoneTailsMatch(a, b string) bool {
	a = jidDigits(a)
	b = jidDigits(b)
	if a == "" || b == "" {
		return false
	}
	if a == b {
		return true
	}
	const n = 11
	sa := a
	sb := b
	if len(sa) >= n {
		sa = sa[len(sa)-n:]
	}
	if len(sb) >= n {
		sb = sb[len(sb)-n:]
	}
	return sa == sb
}

func adminDigitsIndex(participants []map[string]any) map[string]bool {
	out := make(map[string]bool)
	for _, pm := range participants {
		if !participantIsGroupAdmin(pm) {
			continue
		}
		id, _ := pm["id"].(string)
		d := jidDigits(id)
		if d == "" {
			continue
		}
		out[d] = true
		if len(d) >= 11 {
			out[d[len(d)-11:]] = true
		}
	}
	return out
}

func digitsSeenInAdminIndex(idx map[string]bool, digits string) bool {
	if digits == "" {
		return false
	}
	if idx[digits] {
		return true
	}
	if len(digits) >= 11 && idx[digits[len(digits)-11:]] {
		return true
	}
	for k := range idx {
		if phoneTailsMatch(k, digits) {
			return true
		}
	}
	return false
}

func (h *GroupsHandler) waDigitsForAccount(ctx context.Context, accID int64, cfg models.AppConfig) string {
	_ = accID // F08b: per-account Evolution credentials removed; using global config
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		return ""
	}
	evo := &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
	n := evo.getOwnNumber(ctx)
	return jidDigits(n)
}

func (h *GroupsHandler) countVerifiedWAAdmins(ctx context.Context, g models.RedesignGroup) (int, error) {
	admins, err := h.store.ListGroupAdmins(g.ID)
	if err != nil {
		return 0, err
	}
	cfg, _ := h.store.GetConfig()
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		return 0, fmt.Errorf("no evolution")
	}
	groups, err := h.fetchAllGroupsWithParticipantsCached(ctx, baseURL, apiKey, instance)
	if err != nil {
		return 0, err
	}
	gmeta := findGroupMetaByJID(groups, g.JID.String)
	if gmeta == nil {
		return 0, nil
	}
	participants := evolutionParticipantMaps(gmeta)
	idx := adminDigitsIndex(participants)

	n := 0
	for _, a := range admins {
		if a.AccountType != "wa" {
			continue
		}
		d := h.waDigitsForAccount(ctx, a.AccountID, cfg)
		if d == "" {
			continue
		}
		if digitsSeenInAdminIndex(idx, d) {
			n++
		}
	}
	return n, nil
}

func (h *GroupsHandler) promoteWAAccountAsGroupAdmin(ctx context.Context, g models.RedesignGroup, targetWAAccountID int64, cfg models.AppConfig) error {
	if !g.JID.Valid || g.JID.String == "" || !g.WAAccountID.Valid {
		return fmt.Errorf("grupo sem JID ou conta WA")
	}
	// F08b: validate account exists via accounts v2; Evolution credentials come from global config.
	if _, err := h.store.GetAccount(targetWAAccountID); err != nil {
		return fmt.Errorf("conta WA alvo nao encontrada")
	}
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		return fmt.Errorf("Evolution nao configurada para a conta do grupo")
	}
	evoGroup := &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}

	targetDigits := h.waDigitsForAccount(ctx, targetWAAccountID, cfg)
	if targetDigits == "" {
		return fmt.Errorf("nao foi possivel obter o numero WhatsApp da conta selecionada (instancia desconectada?)")
	}

	phoneArg := targetDigits
	// Evolution espera participantes sem sufixo @ — algumas versoes aceitam com @c.us
	_ = evoGroup.updateParticipant(ctx, g.JID.String, "add", []string{phoneArg})
	if err := evoGroup.updateParticipant(ctx, g.JID.String, "promote", []string{phoneArg}); err != nil {
		return err
	}
	return nil
}

// GET /api/groups/from-evolution — lista grupos da Evolution API para o modal de importar.
// Retorna [{id, name, size}] filtrado pelos grupos que ainda não existem no banco.
func (h *GroupsHandler) ListFromEvolution(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "config: "+err.Error())
		return
	}
	baseURL, apiKey, instance := resolveEvolutionCredentials(cfg)
	if baseURL == "" {
		writeErr(w, http.StatusServiceUnavailable, "Evolution API não configurada")
		return
	}

	ctx := r.Context()
	evoGroups, err := h.fetchAllGroupsWithParticipantsCached(ctx, baseURL, apiKey, instance)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Evolution: "+err.Error())
		return
	}

	type option struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Size int    `json:"size"`
	}
	out := make([]option, 0, len(evoGroups))
	for _, g := range evoGroups {
		id, _ := g["id"].(string)
		if id == "" {
			id, _ = g["groupJid"].(string)
		}
		name, _ := g["subject"].(string)
		if name == "" {
			name, _ = g["name"].(string)
		}
		size := 0
		if p, ok := g["participants"].([]any); ok {
			size = len(p)
		} else if sz, ok := g["size"].(float64); ok {
			size = int(sz)
		}
		if id == "" {
			continue
		}
		// Só grupos reais entram no modal de importar. Contatos/broadcast (sem @g.us) não são
		// grupos e viravam registros fantasma quando importados por engano.
		if !strings.HasSuffix(id, "@g.us") {
			continue
		}
		out = append(out, option{ID: id, Name: name, Size: size})
	}

	// Maiores grupos primeiro: os de promoção tendem a ter mais membros que os pessoais,
	// então sobem no modal de importar (a Evolution devolve em ordem arbitrária).
	sort.Slice(out, func(i, j int) bool { return out[i].Size > out[j].Size })

	writeJSON(w, http.StatusOK, out)
}
