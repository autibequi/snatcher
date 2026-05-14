package admin

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type ChannelsV2Handler struct {
	store store.Store
}

func NewChannelsV2Handler(st store.Store) *ChannelsV2Handler {
	return &ChannelsV2Handler{store: st}
}

func (h *ChannelsV2Handler) List(w http.ResponseWriter, r *http.Request) {
	channels, err := h.store.ListChannelsV2()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar canais")
		return
	}
	writeJSON(w, http.StatusOK, channels)
}

func (h *ChannelsV2Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	c, err := h.store.GetChannelV2(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "canal não encontrado")
		return
	}
	groups, _ := h.store.ListGroupsByChannel(id)
	writeJSON(w, http.StatusOK, map[string]any{"channel": c, "groups": groups})
}

func (h *ChannelsV2Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name             string   `json:"name"`
		CategoryID       *int64   `json:"category_id"`
		QualityThreshold *float64 `json:"quality_threshold"`
		DailyCap         *int     `json:"daily_cap"`
	}
	if err := decodeBody(r, &req); err != nil || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name obrigatório")
		return
	}
	c := models.ChannelV2{Name: req.Name, Active: true, QualityThreshold: 0.40, DailyCap: 30}
	if req.QualityThreshold != nil {
		c.QualityThreshold = *req.QualityThreshold
	}
	if req.DailyCap != nil {
		c.DailyCap = *req.DailyCap
	}
	id, err := h.store.CreateChannelV2(c)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar canal")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *ChannelsV2Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	existing, err := h.store.GetChannelV2(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "canal não encontrado")
		return
	}
	var req struct {
		Name             *string  `json:"name"`
		CategoryID       *int64   `json:"category_id"` // deprecated, ignorado
		QualityThreshold *float64 `json:"quality_threshold"`
		DailyCap         *int     `json:"daily_cap"`
		Active           *bool    `json:"active"`
		PriceMin         *float64 `json:"price_min"`
		PriceMax         *float64 `json:"price_max"`
		MinDiscountPct   *float64 `json:"min_discount_pct"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.QualityThreshold != nil {
		existing.QualityThreshold = *req.QualityThreshold
	}
	if req.DailyCap != nil {
		existing.DailyCap = *req.DailyCap
	}
	if req.Active != nil {
		existing.Active = *req.Active
	}
	if req.PriceMin != nil {
		existing.PriceMin = req.PriceMin
	}
	if req.PriceMax != nil {
		existing.PriceMax = req.PriceMax
	}
	if req.MinDiscountPct != nil {
		existing.MinDiscountPct = *req.MinDiscountPct
	}
	if err := h.store.UpdateChannelV2(existing); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ChannelsV2Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	if err := h.store.DeleteChannelV2(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// LinkGroup vincula um grupo a um canal: POST /api/channels/{id}/groups/{groupId}
func (h *ChannelsV2Handler) LinkGroup(w http.ResponseWriter, r *http.Request) {
	channelID, ok1 := pathInt(r, "id")
	groupID, ok2 := pathInt(r, "groupId")
	if !ok1 || !ok2 {
		writeErr(w, http.StatusBadRequest, "ids inválidos")
		return
	}
	if err := h.store.SetGroupChannel(groupID, channelID); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao vincular")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// UnlinkGroup desvincula um grupo do canal: DELETE /api/channels/{id}/groups/{groupId}
func (h *ChannelsV2Handler) UnlinkGroup(w http.ResponseWriter, r *http.Request) {
	_, ok1 := pathInt(r, "id")
	groupID, ok2 := pathInt(r, "groupId")
	if !ok1 || !ok2 {
		writeErr(w, http.StatusBadRequest, "ids inválidos")
		return
	}
	if err := h.store.UnsetGroupChannel(groupID); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao desvincular")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GetWeights retorna os pesos de categoria do canal.
func (h *ChannelsV2Handler) GetWeights(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	weights, err := h.store.ListChannelCategoryWeights(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar pesos")
		return
	}
	if weights == nil {
		weights = []models.ChannelCategoryWeight{}
	}
	writeJSON(w, http.StatusOK, weights)
}

// SetWeights salva os pesos de categoria do canal (substitui todos).
func (h *ChannelsV2Handler) SetWeights(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req []models.ChannelCategoryWeight
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	for i := range req {
		req[i].ChannelID = id
	}
	if err := h.store.SetChannelCategoryWeights(id, req); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao salvar pesos")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
