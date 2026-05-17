package middleware

import (
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	adminhnd "snatcher/backendv2/internal/handlers/admin"
)

// RequireAuth valida o Bearer JWT e injeta user_id no context via adminhnd.CtxWithUserID.
// Retorna 401 se o token for ausente, inválido ou expirado.
func RequireAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			if !strings.HasPrefix(auth, "Bearer ") {
				w.Header().Set("WWW-Authenticate", "Bearer")
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(auth, "Bearer ")
			tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(secret), nil
			})
			if err != nil || !tok.Valid {
				w.Header().Set("WWW-Authenticate", "Bearer")
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			claims, ok := tok.Claims.(jwt.MapClaims)
			if !ok {
				w.Header().Set("WWW-Authenticate", "Bearer")
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			sub, _ := claims["sub"].(float64)
			ctx := adminhnd.CtxWithUserID(r.Context(), int64(sub))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// JWTMiddleware é o middleware legado — mantido para compatibilidade durante migração.
// Novos handlers devem usar RequireAuth que injeta user_id via adminhnd.CtxWithUserID.
//
// TODO: remover JWTMiddleware após verificar que nenhum handler usa o alias diretamente.
// Rastrear progresso em: https://github.com/estrategiahq/snatcher/issues (adicionar issue de cleanup)
func JWTMiddleware(secret string) func(http.Handler) http.Handler {
	return RequireAuth(secret)
}

// CORS adiciona headers de controle de acesso.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
