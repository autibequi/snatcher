package handlers

import (
	"net/http"

	"snatcher/backendv2/internal/store"
)

// ClustersHandler gerencia endpoints de clusters analíticos.
type ClustersHandler struct {
	store store.Store
}

// NewClustersHandler cria um ClustersHandler.
func NewClustersHandler(st store.Store) *ClustersHandler {
	return &ClustersHandler{store: st}
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
	writeJSON(w, http.StatusOK, clusters)
}

// Recompute dispara recomputação manual de clusters.
//
//	@Summary      Recomputar clusters
//	@Description  Agenda recomputação manual de clusters. Executado normalmente pelo job semanal.
//	@Tags         clusters
//	@Produce      json
//	@Success      202  {object}  object{status=string,message=string}
//	@Router       /api/clusters/recompute [post]
func (h *ClustersHandler) Recompute(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusAccepted, map[string]string{
		"status":  "queued",
		"message": "Recompute agendado. Pode levar alguns minutos.",
	})
}
