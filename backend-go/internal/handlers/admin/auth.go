package admin

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler cuida de login/refresh/logout/me com JWT.
type AuthHandler struct {
	db     *sqlx.DB
	secret []byte
}

func NewAuthHandler(db *sqlx.DB, secret string) *AuthHandler {
	return &AuthHandler{db: db, secret: []byte(secret)}
}

// POST /api/auth/login
//
//	@Summary      Login
//	@Description  Autentica com email e senha, retorna access_token JWT + refresh_token.
//	@Tags         auth
//	@Accept       json
//	@Produce      json
//	@Param        body  body      object{email=string,password=string}  true  "Credenciais"
//	@Success      200   {object}  object{access_token=string,refresh_token=string,token_type=string}
//	@Failure      400   {object}  object{error=string}
//	@Failure      401   {object}  object{error=string}
//	@Router       /api/auth/login [post]
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
		writeErr(w, http.StatusBadRequest, "email e password obrigatorios")
		return
	}

	var user struct {
		ID           int64  `db:"id"`
		Email        string `db:"email"`
		PasswordHash string `db:"password_hash"`
		Name         string `db:"name"`
		Role         string `db:"role"`
	}
	if err := h.db.GetContext(r.Context(), &user,
		`SELECT id, email, password_hash, COALESCE(name,'') as name, role FROM users WHERE email = $1`,
		strings.ToLower(strings.TrimSpace(body.Email))); err != nil {
		writeErr(w, http.StatusUnauthorized, "credenciais invalidas")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
		writeErr(w, http.StatusUnauthorized, "credenciais invalidas")
		return
	}

	access, err := h.signAccess(user.ID, user.Email, user.Role)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao gerar token")
		return
	}

	refresh, err := h.createRefresh(r.Context(), user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao gerar refresh")
		return
	}

	// Atualizar last_login_at
	_, _ = h.db.ExecContext(r.Context(), `UPDATE users SET last_login_at = now() WHERE id = $1`, user.ID)

	writeJSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"refresh_token": refresh,
		"token_type":    "bearer",
		"user": map[string]any{
			"id": user.ID, "email": user.Email, "name": user.Name, "role": user.Role,
		},
	})
}

// POST /api/auth/refresh
//
//	@Summary      Refresh token
//	@Description  Troca um refresh_token válido por novo par access+refresh.
//	@Tags         auth
//	@Accept       json
//	@Produce      json
//	@Param        body  body      object{refresh_token=string}  true  "Refresh token"
//	@Success      200   {object}  object{access_token=string,refresh_token=string,token_type=string}
//	@Failure      400   {object}  object{error=string}
//	@Failure      401   {object}  object{error=string}
//	@Router       /api/auth/refresh [post]
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		writeErr(w, http.StatusBadRequest, "refresh_token obrigatorio")
		return
	}

	tokenHash := sha256Hex(body.RefreshToken)
	var row struct {
		ID        int64     `db:"id"`
		UserID    int64     `db:"user_id"`
		ExpiresAt time.Time `db:"expires_at"`
	}
	if err := h.db.GetContext(r.Context(), &row,
		`SELECT id, user_id, expires_at FROM refresh_tokens
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
		tokenHash); err != nil {
		writeErr(w, http.StatusUnauthorized, "refresh token invalido ou expirado")
		return
	}

	// Revogar token antigo
	_, _ = h.db.ExecContext(r.Context(), `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, row.ID)

	var user struct {
		Email string `db:"email"`
		Role  string `db:"role"`
	}
	if err := h.db.GetContext(r.Context(), &user, `SELECT email, role FROM users WHERE id = $1`, row.UserID); err != nil {
		writeErr(w, http.StatusUnauthorized, "usuario nao encontrado")
		return
	}

	access, _ := h.signAccess(row.UserID, user.Email, user.Role)
	refresh, _ := h.createRefresh(r.Context(), row.UserID)

	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": access, "refresh_token": refresh, "token_type": "bearer",
	})
}

// POST /api/auth/logout
//
//	@Summary      Logout
//	@Description  Revoga o refresh_token atual.
//	@Tags         auth
//	@Accept       json
//	@Produce      json
//	@Param        body  body      object{refresh_token=string}  false  "Refresh token"
//	@Success      200   {object}  object{status=string}
//	@Router       /api/auth/logout [post]
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.RefreshToken != "" {
		tokenHash := sha256Hex(body.RefreshToken)
		_, _ = h.db.ExecContext(r.Context(),
			`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, tokenHash)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

// GET /api/auth/me
//
//	@Summary      Me
//	@Description  Retorna dados do usuário autenticado.
//	@Tags         auth
//	@Produce      json
//	@Security     BearerAuth
//	@Success      200  {object}  object{id=int,email=string,name=string,role=string}
//	@Failure      401  {object}  object{error=string}
//	@Router       /api/auth/me [get]
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromCtx(r.Context())
	if userID == 0 {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var user struct {
		ID    int64  `db:"id"    json:"id"`
		Email string `db:"email" json:"email"`
		Name  string `db:"name"  json:"name"`
		Role  string `db:"role"  json:"role"`
	}
	if err := h.db.GetContext(r.Context(), &user,
		`SELECT id, email, COALESCE(name,'') as name, role FROM users WHERE id = $1`, userID); err != nil {
		writeErr(w, http.StatusUnauthorized, "usuario nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) signAccess(userID int64, email, role string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   userID,
		"email": email,
		"role":  role,
		"exp":   time.Now().Add(15 * time.Minute).Unix(),
		"iat":   time.Now().Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(h.secret)
}

func (h *AuthHandler) createRefresh(ctx context.Context, userID int64) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	raw := hex.EncodeToString(b)
	hash := sha256Hex(raw)
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
		userID, hash)
	if err != nil {
		return "", err
	}
	return raw, nil
}

// ctxKeyUserID é a chave de context para o user_id.
type ctxKeyUserID struct{}

// UserIDFromCtx extrai o user_id injetado pelo middleware RequireAuth.
func UserIDFromCtx(ctx context.Context) int64 {
	id, _ := ctx.Value(ctxKeyUserID{}).(int64)
	return id
}

// CtxWithUserID cria um context com user_id (usado pelo middleware).
func CtxWithUserID(ctx context.Context, id int64) context.Context {
	return context.WithValue(ctx, ctxKeyUserID{}, id)
}

// sha256Hex retorna o hash SHA-256 de s em hexadecimal.
func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h)
}
