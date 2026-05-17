package admin

import (
	"net/http"
	"strings"

	"snatcher/backendv2/internal/models"
	store "snatcher/backendv2/internal/repositories"
	"snatcher/backendv2/internal/services/jobs"

	"github.com/jmoiron/sqlx"
)

// ClustersHandler gerencia endpoints de clusters analíticos.
type ClustersHandler struct {
	store store.Store
	db    *sqlx.DB
}

// NewClustersHandler cria um ClustersHandler.
func NewClustersHandler(st store.Store) *ClustersHandler {
	return &ClustersHandler{store: st}
}

// NewClustersHandlerDB cria um ClustersHandler com acesso direto ao DB.
func NewClustersHandlerDB(st store.Store, db *sqlx.DB) *ClustersHandler {
	return &ClustersHandler{store: st, db: db}
}

// parseDeviceFromUA classifica um User-Agent em "ios", "android" ou "web".
func parseDeviceFromUA(ua string) string {
	lower := strings.ToLower(ua)
	if strings.Contains(lower, "iphone") || strings.Contains(lower, "ipad") || strings.Contains(lower, "ios") {
		return "ios"
	}
	if strings.Contains(lower, "android") {
		return "android"
	}
	return "web"
}

// List retorna todos os clusters computados.
//
//	@Summary      Listar clusters
//	@Description  Retorna clusters analíticos de canais ordenados por data de computação.
//	@Tags         clusters
//	@Produce      json
//	@Success      200  {array}   models.Cluster
//	@Failure      500  {object}  object{error=string}
//	@Router       /api/clusters [get]
func (h *ClustersHandler) List(w http.ResponseWriter, r *http.Request) {
	clusters, err := h.store.ListClusters()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar clusters")
		return
	}
	if clusters == nil {
		clusters = []models.Cluster{}
	}
	writeJSON(w, http.StatusOK, clusters)
}

// Recompute dispara recomputação manual de clusters.
//
//	@Summary      Recomputar clusters
//	@Description  Executa imediatamente o job KMeans de clustering de canais.
//	@Tags         clusters
//	@Produce      json
//	@Success      202  {object}  object{status=string,message=string}
//	@Failure      500  {object}  object{error=string}
//	@Router       /api/clusters/recompute [post]
func (h *ClustersHandler) Recompute(w http.ResponseWriter, r *http.Request) {
	if h.db == nil {
		writeErr(w, http.StatusServiceUnavailable, "db nao disponivel")
		return
	}
	go func() {
		if err := jobs.RunComputeClusters(r.Context(), h.db); err != nil {
			// log apenas — a resposta já foi enviada
			_ = err
		}
	}()
	writeJSON(w, http.StatusAccepted, map[string]string{
		"status":  "running",
		"message": "Recompute de clusters iniciado. Consulte GET /api/clusters em alguns instantes.",
	})
}

// Get retorna um cluster pelo ID com métricas enriquecidas do click_log.
//
//	@Summary      Detalhe do cluster
//	@Description  Retorna cluster com device_split, peak_hour e avg_ticket derivados do clicklog.
//	@Tags         clusters
//	@Produce      json
//	@Param        id   path      int  true  "Cluster ID"
//	@Success      200  {object}  object
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Router       /api/clusters/{id} [get]
func (h *ClustersHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	cluster, err := h.store.GetCluster(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "cluster nao encontrado")
		return
	}

	type deviceSplit struct {
		IOS     float64 `json:"ios"`
		Android float64 `json:"android"`
		Web     float64 `json:"web"`
	}

	result := map[string]any{
		"id":              cluster.ID,
		"label":           cluster.Label,
		"description":     cluster.Description,
		"member_channels": cluster.MemberChannels,
		"metrics":         cluster.Metrics,
		"top_categories":  cluster.TopCategories,
		"top_brands":      cluster.TopBrands,
		"computed_at":     cluster.ComputedAt,
		"device_split":    deviceSplit{},
		"peak_hour":       nil,
		"avg_ticket":      nil,
	}

	if h.db == nil {
		writeJSON(w, http.StatusOK, result)
		return
	}

	// device_split: agrega user_agent do clicklog → classifica em ios/android/web
	type uaRow struct {
		UserAgent string `db:"user_agent"`
		Count     int    `db:"cnt"`
	}
	var uaRows []uaRow
	_ = h.db.SelectContext(r.Context(), &uaRows,
		`SELECT user_agent, COUNT(*) AS cnt FROM clicklog GROUP BY user_agent`)

	totDevice := 0
	ios, android, web := 0, 0, 0
	for _, row := range uaRows {
		totDevice += row.Count
		switch parseDeviceFromUA(row.UserAgent) {
		case "ios":
			ios += row.Count
		case "android":
			android += row.Count
		default:
			web += row.Count
		}
	}
	if totDevice > 0 {
		result["device_split"] = deviceSplit{
			IOS:     float64(ios) / float64(totDevice) * 100,
			Android: float64(android) / float64(totDevice) * 100,
			Web:     float64(web) / float64(totDevice) * 100,
		}
	}

	// peak_hour: hora com mais clicks
	var peakHour *int
	var ph int
	err = h.db.GetContext(r.Context(), &ph,
		`SELECT EXTRACT(HOUR FROM clicked_at)::int AS hour
		 FROM clicklog
		 GROUP BY hour
		 ORDER BY COUNT(*) DESC
		 LIMIT 1`)
	if err == nil {
		peakHour = &ph
	}
	result["peak_hour"] = peakHour

	// avg_ticket: preço médio dos produtos que geraram clicks
	var avgTicket *float64
	var at float64
	err = h.db.GetContext(r.Context(), &at,
		`SELECT AVG(p.price)
		 FROM clicklog cl
		 JOIN product p ON p.id = cl.product_id`)
	if err == nil {
		result["avg_ticket"] = at
	} else {
		result["avg_ticket"] = avgTicket
	}

	writeJSON(w, http.StatusOK, result)
}
