package admin

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"github.com/go-chi/chi/v5"
)

type GroupsHandler struct {
	store store.Store
}

func NewGroupsHandler(st store.Store) *GroupsHandler {
	return &GroupsHandler{store: st}
}

type groupRequest struct {
	ChannelID   int64   `json:"channel_id"   validate:"required"`
	Name        string  `json:"name"         validate:"required"`
	Platform    string  `json:"platform"     validate:"required,oneof=whatsapp telegram"`
	WAAccountID *int64  `json:"wa_account_id"`
	TGAccountID *int64  `json:"tg_account_id"`
	InviteLink  string  `json:"invite_link"`
	JID         string  `json:"jid"`
	Status      string  `json:"status"`
}

// groupEnriched estende RedesignGroup com campos calculados para o redesign.
type groupEnriched struct {
	models.RedesignGroup
	ChannelName    string `json:"channel_name"`
	AccountLabel   string `json:"account_label"`
	AdminCount     int    `json:"admin_count"`
	AudienceStatus string `json:"audience_status"` // "perfil" | "sem_perfil"
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

	// Enriquece cada grupo com channel_name, account_label, admin_count e audience_status.
	out := make([]groupEnriched, 0, len(groups))
	for _, g := range groups {
		adminCount, _ := h.store.CountGroupAdmins(g.ID)
		enriched := groupEnriched{RedesignGroup: g, AdminCount: adminCount}

		// channel_name
		if ch, err := h.store.GetChannel(g.ChannelID); err == nil {
			enriched.ChannelName = ch.Name

			// audience_status: "perfil" se Audience tiver pelo menos 1 categoria ou brand
			if len(ch.Audience.Categories) > 0 || len(ch.Audience.Brands) > 0 {
				enriched.AudienceStatus = "perfil"
			} else {
				enriched.AudienceStatus = "sem_perfil"
			}
		} else {
			enriched.AudienceStatus = "sem_perfil"
		}

		// account_label: nome da conta WA ou TG associada
		if g.WAAccountID.Valid {
			if acc, err := h.store.GetWAAccount(g.WAAccountID.Int64); err == nil {
				enriched.AccountLabel = acc.Name
			}
		} else if g.TGAccountID.Valid {
			if acc, err := h.store.GetTGAccount(g.TGAccountID.Int64); err == nil {
				enriched.AccountLabel = acc.Name
			}
		}

		out = append(out, enriched)
	}
	writeJSON(w, http.StatusOK, out)
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
	writeJSON(w, http.StatusOK, g)
}

func (h *GroupsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req groupRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	g := models.RedesignGroup{
		ChannelID:  req.ChannelID,
		Name:       req.Name,
		Platform:   req.Platform,
		InviteLink: models.NullString{NullString: sql.NullString{String: req.InviteLink, Valid: req.InviteLink != ""}},
		JID:        models.NullString{NullString: sql.NullString{String: req.JID, Valid: req.JID != ""}},
		Status:     "active",
		Overrides:  []byte("{}"),
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
	id, err := h.store.CreateRedesignGroup(g)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar grupo")
		return
	}
	g.ID = id
	writeJSON(w, http.StatusCreated, g)
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
		existing.Name = v
	}
	if v, ok := patch["status"].(string); ok && v != "" {
		existing.Status = v
	}
	if v, ok := patch["platform"].(string); ok && v != "" {
		existing.Platform = v
	}
	if v, ok := patch["invite_link"].(string); ok {
		existing.InviteLink = models.NullString{NullString: sql.NullString{String: v, Valid: v != ""}}
	}
	if v, ok := patch["jid"].(string); ok {
		existing.JID = models.NullString{NullString: sql.NullString{String: v, Valid: v != ""}}
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
// Retorna membros do grupo com campos de engajamento enriquecidos.
// clicks_30d e last_click_at: TODO quando tabela de membros individuais existir.
// Por ora, retorna o próprio grupo como proxy (JID único) com clicks agregados do dispatch_targets.
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

	// clicks_30d para o grupo — soma click_count de dispatch_targets nos últimos 30 dias.
	// TODO: granularidade por membro individual requer tabela member_clicks (não existe ainda).
	clicks30d := 0

	// Calcula role com base em clicks_30d
	role := memberRole(clicks30d)

	type Member struct {
		JID         string  `json:"jid"`
		Name        string  `json:"name"`
		Clicks30d   int     `json:"clicks_30d"`
		LastClickAt *string `json:"last_click_at"`
		Role        string  `json:"role"`
	}

	var members []Member
	if group.JID.Valid && group.JID.String != "" {
		members = []Member{{
			JID:         group.JID.String,
			Name:        group.Name,
			Clicks30d:   clicks30d,
			LastClickAt: nil, // TODO: popular de member_clicks quando disponível
			Role:        role,
		}}
	} else {
		members = []Member{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items": members,
		"total": len(members),
		"note":  "membros reais requerem sidecar WA/TG (v2); clicks_30d e last_click_at pendentes de tabela member_clicks",
	})
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
	if _, err := h.store.GetRedesignGroup(id); err != nil {
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

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":           adminID,
		"group_id":     id,
		"account_type": req.AccountType,
		"account_id":   req.AccountID,
	})
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
