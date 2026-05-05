package handlers

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type SourcesHandler struct {
	store store.Store
}

func NewSources(st store.Store) *SourcesHandler {
	return &SourcesHandler{store: st}
}

// List retorna todos os sources
//
//	@Summary      Listar sources
//	@Description  Retorna todos os marketplace sources (Mercado Livre, Amazon, etc.).
//	@Tags         sources
//	@Produce      json
//	@Success      200  {array}   models.Source
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/sources [get]
func (h *SourcesHandler) List(w http.ResponseWriter, r *http.Request) {
	// Para agora, retorna os sources hardcoded
	// Em produção, seria consultado o banco
	sources := []models.Source{
		{
			ID:       "ml",
			Name:     "Mercado Livre",
			Category: "ecommerce",
			Enabled:  true,
		},
		{
			ID:       "amz",
			Name:     "Amazon",
			Category: "ecommerce",
			Enabled:  true,
		},
	}
	writeJSON(w, http.StatusOK, sources)
}

// Get retorna um source específico
//
//	@Summary      Obter source
//	@Description  Retorna um marketplace source pelo ID.
//	@Tags         sources
//	@Param        id   path      string  true  "Source ID"
//	@Produce      json
//	@Success      200  {object}  models.Source
//	@Failure      404  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/sources/{id} [get]
func (h *SourcesHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Hardcoded para agora; em produção seria consultado DB
	var source models.Source
	switch id {
	case "ml":
		source = models.Source{
			ID:       "ml",
			Name:     "Mercado Livre",
			Category: "ecommerce",
			Enabled:  true,
		}
	case "amz":
		source = models.Source{
			ID:       "amz",
			Name:     "Amazon",
			Category: "ecommerce",
			Enabled:  true,
		}
	default:
		writeErr(w, http.StatusNotFound, "source not found")
		return
	}

	writeJSON(w, http.StatusOK, source)
}

// Update atualiza um source (toggle enabled)
//
//	@Summary      Atualizar source
//	@Description  Ativa/desativa um marketplace source.
//	@Tags         sources
//	@Param        id   path      string  true  "Source ID"
//	@Param        body body      object{enabled=bool}  true  "Enabled flag"
//	@Produce      json
//	@Success      200  {object}  models.Source
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/sources/{id} [patch]
func (h *SourcesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request")
		return
	}

	// Hardcoded resposta; em produção seria atualizado DB
	var source models.Source
	switch id {
	case "ml":
		source = models.Source{
			ID:       "ml",
			Name:     "Mercado Livre",
			Category: "ecommerce",
			Enabled:  body.Enabled,
		}
	case "amz":
		source = models.Source{
			ID:       "amz",
			Name:     "Amazon",
			Category: "ecommerce",
			Enabled:  body.Enabled,
		}
	default:
		writeErr(w, http.StatusNotFound, "source not found")
		return
	}

	writeJSON(w, http.StatusOK, source)
}
