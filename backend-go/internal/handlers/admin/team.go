package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

type TeamHandler struct {
	db *sqlx.DB
}

func NewTeamHandler(db *sqlx.DB) *TeamHandler {
	return &TeamHandler{db: db}
}

type teamMember struct {
	ID          int64  `db:"id" json:"id"`
	Email       string `db:"email" json:"email"`
	Name        string `db:"name" json:"name"`
	Role        string `db:"role" json:"role"`
	CreatedAt   string `db:"created_at" json:"created_at"`
	LastLoginAt string `db:"last_login_at" json:"last_login_at"`
}

// GET /api/team
func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	var members []teamMember
	err := h.db.SelectContext(r.Context(), &members,
		`SELECT id, email, COALESCE(name,'') as name, role,
		        created_at::text, COALESCE(last_login_at::text,'') as last_login_at
		 FROM users ORDER BY created_at`)
	if err != nil {
		writeJSON(w, http.StatusOK, []teamMember{})
		return
	}
	if members == nil {
		members = []teamMember{}
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

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar hash")
		return
	}

	var id int64
	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (email) DO NOTHING RETURNING id`,
		req.Email, string(hash), req.Name, req.Role).Scan(&id)
	if err != nil || id == 0 {
		writeErr(w, http.StatusConflict, "email ja cadastrado")
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
	h.db.ExecContext(r.Context(), `UPDATE users SET role = $1 WHERE id = $2`, req.Role, id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/team/:id
func (h *TeamHandler) Remove(w http.ResponseWriter, r *http.Request) {
	id, _ := pathInt(r, "id")
	h.db.ExecContext(r.Context(), `DELETE FROM users WHERE id = $1`, id)
	w.WriteHeader(http.StatusNoContent)
}
