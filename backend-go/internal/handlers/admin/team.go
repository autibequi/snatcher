package admin

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
	"snatcher/backendv2/internal/auth"
	"snatcher/backendv2/internal/repositories"
)

type TeamHandler struct {
	repo *repositories.TeamRepo
}

func NewTeamHandler(db *sqlx.DB) *TeamHandler {
	return &TeamHandler{repo: repositories.NewTeamRepo(db)}
}

// GET /api/team
func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	members, err := h.repo.List(r.Context())
	if err != nil {
		// Lista vazia em erro de leitura é a semântica pré-existente — mantida.
		writeJSON(w, http.StatusOK, []repositories.TeamMember{})
		return
	}
	if members == nil {
		members = []repositories.TeamMember{}
	}
	writeJSON(w, http.StatusOK, members)
}

// POST /api/team — convidar operador
func (h *TeamHandler) Invite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		writeErr(w, http.StatusBadRequest, "email obrigatorio")
		return
	}
	if req.Role == "" {
		req.Role = "operator"
	}
	if req.Password == "" {
		req.Password = "changeme123"
	}

	// Usar BcryptCost centralizado (12) — consistente com setup.go, password.go e spec 016.
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), auth.BcryptCost)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar hash")
		return
	}

	id, err := h.repo.Invite(r.Context(), req.Email, req.Name, req.Role, string(hash))
	if errors.Is(err, repositories.ErrEmailTaken) {
		writeErr(w, http.StatusConflict, "email ja cadastrado")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar usuario")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "email": req.Email, "role": req.Role})
}

// PATCH /api/team/:id/role
func (h *TeamHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	id, _ := pathInt(r, "id")
	var req struct {
		Role string `json:"role"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Role != "operator" && req.Role != "admin" {
		writeErr(w, http.StatusBadRequest, "role invalido")
		return
	}
	if err := h.repo.UpdateRole(r.Context(), id, req.Role); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar role")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/team/:id
func (h *TeamHandler) Remove(w http.ResponseWriter, r *http.Request) {
	id, _ := pathInt(r, "id")
	if err := h.repo.Remove(r.Context(), id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao remover usuario")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
