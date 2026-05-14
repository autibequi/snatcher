package admin

import (
	"encoding/json"
	"net/http"
	"time"

	"snatcher/backendv2/internal/services/affiliates"
	"snatcher/backendv2/internal/models"
	store "snatcher/backendv2/internal/repositories"

	"github.com/jmoiron/sqlx"
)

// affiliateProgramResp expõe credentials para a UI admin (o modelo usa json:"-" no Credentials).
type affiliateProgramResp struct {
	ID          int64           `json:"id"`
	ShortID     string          `json:"short_id"`
	Name        string          `json:"name"`
	Marketplace string          `json:"marketplace"`
	Credentials json.RawMessage `json:"credentials"`
	Active      bool            `json:"active"`
	Rules       json.RawMessage `json:"rules"`
	Postback    json.RawMessage `json:"postback"`
	CreatedAt   time.Time       `json:"created_at"`
}

func toAffiliateProgramResp(p models.AffiliateProgram) affiliateProgramResp {
	rawOrEmpty := func(b []byte) json.RawMessage {
		if len(b) == 0 {
			return json.RawMessage([]byte("{}"))
		}
		return json.RawMessage(b)
	}
	creds := p.Credentials
	if len(creds) == 0 {
		creds = []byte("{}")
	}
	mp := p.Marketplace
	if c := affiliates.CanonicalAffiliateMarketplace(mp); c != "" {
		mp = c
	}
	return affiliateProgramResp{
		ID:          p.ID,
		ShortID:     p.ShortID,
		Name:        p.Name,
		Marketplace: mp,
		Credentials: json.RawMessage(creds),
		Active:      p.Active,
		Rules:       rawOrEmpty(p.Rules),
		Postback:    rawOrEmpty(p.Postback),
		CreatedAt:   p.CreatedAt,
	}
}

type AffiliateProgramsHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewAffiliateProgramsHandler(st store.Store) *AffiliateProgramsHandler {
	return &AffiliateProgramsHandler{store: st}
}

// NewAffiliateProgramsHandlerDB cria o handler com acesso direto ao DB para queries analíticas.
func NewAffiliateProgramsHandlerDB(st store.Store, db *sqlx.DB) *AffiliateProgramsHandler {
	return &AffiliateProgramsHandler{store: st, db: db}
}

// List retorna todos os programas de afiliado.
func (h *AffiliateProgramsHandler) List(w http.ResponseWriter, r *http.Request) {
	programs, err := h.store.ListAffiliatePrograms(nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar programas")
		return
	}
	if programs == nil {
		programs = []models.AffiliateProgram{}
	}
	out := make([]affiliateProgramResp, len(programs))
	for i := range programs {
		out[i] = toAffiliateProgramResp(programs[i])
	}
	writeJSON(w, http.StatusOK, out)
}

// MarketplaceCatalog GET /api/affiliates/marketplace-catalog
// Catálogo único (enum) para a UI — ids canônicos + labels + campo de credencial.
func (h *AffiliateProgramsHandler) MarketplaceCatalog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"marketplaces": affiliates.MarketplaceCatalog(),
	})
}

// Get retorna um programa de afiliado por ID.
func (h *AffiliateProgramsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetAffiliateProgram(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "programa nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, toAffiliateProgramResp(p))
}

// Create cria um novo programa de afiliado.
func (h *AffiliateProgramsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string          `json:"name" validate:"required"`
		Marketplace string          `json:"marketplace" validate:"required"`
		Active      *bool           `json:"active"`
		Credentials json.RawMessage `json:"credentials"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	canon := affiliates.CanonicalAffiliateMarketplace(req.Marketplace)
	if !affiliates.ValidCanonicalMarketplace(canon) {
		writeErr(w, http.StatusBadRequest, "marketplace invalido: use um id listado em GET /api/affiliates/marketplace-catalog")
		return
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	creds := []byte("{}")
	if len(req.Credentials) > 0 {
		b, err := normalizeAffiliateCredentialsJSON(req.Credentials)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid credentials")
			return
		}
		creds = b
	}
	p := models.AffiliateProgram{
		Name:        req.Name,
		Marketplace: canon,
		Active:      active,
		Credentials: creds,
		Rules:       []byte("{}"),
		Postback:    []byte("{}"),
	}
	id, err := h.store.CreateAffiliateProgram(p)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar programa")
		return
	}
	reloaded, err := h.store.GetAffiliateProgram(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao recarregar programa")
		return
	}
	writeJSON(w, http.StatusCreated, toAffiliateProgramResp(reloaded))
}

// Update aplica PATCH parcial em um programa (active, credentials, rules, postback, name).
func (h *AffiliateProgramsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	existing, err := h.store.GetAffiliateProgram(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "programa nao encontrado")
		return
	}

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}

	if v, ok := raw["name"]; ok {
		var name string
		if err := json.Unmarshal(v, &name); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid name")
			return
		}
		existing.Name = name
	}
	if v, ok := raw["active"]; ok {
		var active bool
		if err := json.Unmarshal(v, &active); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid active")
			return
		}
		existing.Active = active
	}
	if v, ok := raw["rules"]; ok {
		existing.Rules = append([]byte(nil), v...)
	}
	if v, ok := raw["postback"]; ok {
		existing.Postback = append([]byte(nil), v...)
	}
	if v, ok := raw["credentials"]; ok {
		b, err := normalizeAffiliateCredentialsJSON(v)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid credentials")
			return
		}
		existing.Credentials = b
	}

	if err := h.store.UpdateAffiliateProgram(existing); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar programa")
		return
	}
	out, err := h.store.GetAffiliateProgram(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao recarregar programa")
		return
	}
	writeJSON(w, http.StatusOK, toAffiliateProgramResp(out))
}

func normalizeAffiliateCredentialsJSON(raw json.RawMessage) ([]byte, error) {
	if len(raw) == 0 {
		return []byte("{}"), nil
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		var verify json.RawMessage
		if err := json.Unmarshal([]byte(asString), &verify); err != nil {
			return nil, err
		}
		return []byte(asString), nil
	}
	var tmp any
	if err := json.Unmarshal(raw, &tmp); err != nil {
		return nil, err
	}
	return json.Marshal(tmp)
}

// Delete deleta um programa de afiliado.
func (h *AffiliateProgramsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteAffiliateProgram(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Stats retorna estatísticas agregadas por programa de afiliado.
//
//	@Summary      Stats por programa de afiliado
//	@Description  Retorna clicks_30d, conversions_30d, revenue_30d e last_sync_at por programa.
//	@Tags         affiliates
//	@Produce      json
//	@Success      200  {array}   object{id=int,name=string,marketplace=string,clicks_30d=int,conversions_30d=int,revenue_30d=number,last_sync_at=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates/programs/stats [get]
func (h *AffiliateProgramsHandler) Stats(w http.ResponseWriter, r *http.Request) {
	programs, err := h.store.ListAffiliatePrograms(nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar programas")
		return
	}

	type programStats struct {
		ID             int64   `json:"id"`
		Name           string  `json:"name"`
		Marketplace    string  `json:"marketplace"`
		Active         bool    `json:"active"`
		Clicks30d      int     `json:"clicks_30d"`
		Conversions30d int     `json:"conversions_30d"`
		Revenue30d     float64 `json:"revenue_30d"`
		LastSyncAt     *string `json:"last_sync_at"`
	}

	since30d := time.Now().Add(-30 * 24 * time.Hour)

	out := make([]programStats, 0, len(programs))
	for _, p := range programs {
		stats := programStats{
			ID:          p.ID,
			Name:        p.Name,
			Marketplace: p.Marketplace,
			Active:      p.Active,
		}

		if h.db != nil {
			// clicks_30d: clicks do clicklog para produtos cujo source == marketplace do programa
			_ = h.db.GetContext(r.Context(), &stats.Clicks30d,
				`SELECT COUNT(*) FROM clicklog cl
				 JOIN product pr ON pr.id = cl.product_id
				 WHERE pr.source = $1 AND cl.clicked_at >= $2`,
				p.Marketplace, since30d)

			// conversions_30d: conversões registradas na tabela affiliate_conversions
			_ = h.db.GetContext(r.Context(), &stats.Conversions30d,
				`SELECT COUNT(*) FROM affiliate_conversions
				 WHERE program_id = $1 AND created_at >= $2`, p.ID, since30d)

			// revenue_30d: soma de revenue das conversões aprovadas
			_ = h.db.GetContext(r.Context(), &stats.Revenue30d,
				`SELECT COALESCE(SUM(revenue), 0.0) FROM affiliate_conversions
				 WHERE program_id = $1 AND status = 'approved' AND created_at >= $2`, p.ID, since30d)

			// last_sync_at: MAX(created_at) das conversões do programa
			var lastSync *string
			type lastSyncRow struct {
				LastSync *string `db:"last_sync"`
			}
			var row lastSyncRow
			_ = h.db.GetContext(r.Context(), &row,
				`SELECT to_char(MAX(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync
				 FROM affiliate_conversions WHERE program_id = $1`, p.ID)
			lastSync = row.LastSync
			stats.LastSyncAt = lastSync
		}

		out = append(out, stats)
	}

	writeJSON(w, http.StatusOK, out)
}

// BuildLink constrói o link de afiliado para um produto.
//
// POST /api/affiliates/build-link
func (h *AffiliateProgramsHandler) BuildLink(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductURL  string `json:"product_url" validate:"required"`
		Marketplace string `json:"marketplace" validate:"required"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	canon := affiliates.CanonicalAffiliateMarketplace(req.Marketplace)
	if canon == "" {
		writeErr(w, http.StatusBadRequest, "marketplace desconhecido: use um id do catalogo GET /api/affiliates/marketplace-catalog")
		return
	}
	programs, err := h.store.ListAffiliateProgramsByMarketplace(canon)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar programas")
		return
	}
	link, programName, err := affiliates.BuildLink(req.ProductURL, canon, programs)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao construir link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": link, "program": programName})
}

// CheckCoverage GET /api/affiliates/coverage?marketplace=amazon
// Retorna se há programa configurado e com credenciais para o marketplace.
func (h *AffiliateProgramsHandler) CheckCoverage(w http.ResponseWriter, r *http.Request) {
	marketplace := r.URL.Query().Get("marketplace")
	if marketplace == "" {
		writeErr(w, http.StatusBadRequest, "marketplace obrigatório")
		return
	}
	canon := affiliates.CanonicalAffiliateMarketplace(marketplace)
	programs, _ := h.store.ListAffiliatePrograms(nil)
	writeJSON(w, http.StatusOK, map[string]any{
		"marketplace":   marketplace,
		"canonical":     canon,
		"has_affiliate": canon != "" && affiliates.HasAffiliate(canon, programs),
	})
}
