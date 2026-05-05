package admin

import (
	"net/http"

	"golang.org/x/crypto/bcrypt"
	"github.com/jmoiron/sqlx"
)

type SetupHandler struct {
	db *sqlx.DB
}

func NewSetupHandler(db *sqlx.DB) *SetupHandler {
	return &SetupHandler{db: db}
}

// Status retorna se o setup inicial é necessário (nenhum usuário cadastrado).
// GET /api/setup/status — público
func (h *SetupHandler) Status(w http.ResponseWriter, r *http.Request) {
	var count int
	if err := h.db.Get(&count, `SELECT COUNT(*) FROM users`); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao verificar setup")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"needs_setup": count == 0})
}

// CreateAdmin cria o primeiro usuário admin. Só funciona se não existir nenhum usuário.
// POST /api/setup/create-admin — público
func (h *SetupHandler) CreateAdmin(w http.ResponseWriter, r *http.Request) {
	var count int
	if err := h.db.Get(&count, `SELECT COUNT(*) FROM users`); err != nil || count > 0 {
		writeErr(w, http.StatusForbidden, "setup já realizado")
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeBody(r, &req); err != nil || req.Email == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "nome, email e password obrigatórios")
		return
	}
	if len(req.Password) < 8 {
		writeErr(w, http.StatusBadRequest, "password deve ter pelo menos 8 caracteres")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao processar senha")
		return
	}

	var id int64
	err = h.db.QueryRow(
		`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin') RETURNING id`,
		req.Email, string(hash), req.Name,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar usuário")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":    id,
		"email": req.Email,
		"role":  "admin",
	})
}
