package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

type AffiliatePostbackHandler struct {
	db    *sqlx.DB
	store store.Store
}

func NewAffiliatePostbackHandler(db *sqlx.DB) *AffiliatePostbackHandler {
	return &AffiliatePostbackHandler{db: db}
}

// NewAffiliatePostbackHandlerStore cria o handler com store para inserir conversões.
func NewAffiliatePostbackHandlerStore(db *sqlx.DB, st store.Store) *AffiliatePostbackHandler {
	return &AffiliatePostbackHandler{db: db, store: st}
}

// POST /webhooks/affiliate/:programId
// Recebe conversão do programa de afiliado, valida HMAC, persiste em affiliate_postbacks.
func (h *AffiliatePostbackHandler) Handle(w http.ResponseWriter, r *http.Request) {
	programID := chi.URLParam(r, "programId")

	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024))
	if err != nil {
		http.Error(w, "body error", http.StatusBadRequest)
		return
	}

	// Buscar programa e secretToken
	var prog struct {
		ID       int64  `db:"id"`
		Postback []byte `db:"postback"`
	}
	if err := h.db.GetContext(r.Context(), &prog,
		`SELECT id, postback FROM affiliate_programs WHERE short_id = $1 OR id::text = $1`, programID); err != nil {
		http.Error(w, "programa nao encontrado", http.StatusNotFound)
		return
	}

	var postbackCfg struct {
		Enabled     bool   `json:"enabled"`
		SecretToken string `json:"secret_token"`
	}
	_ = json.Unmarshal(prog.Postback, &postbackCfg)

	// Validar HMAC se secretToken configurado
	if postbackCfg.SecretToken != "" {
		sig := r.Header.Get("X-Signature")
		if sig == "" {
			sig = r.Header.Get("X-Hub-Signature-256")
		}
		if sig != "" {
			expected := computeHMAC(body, postbackCfg.SecretToken)
			clean := strings.TrimPrefix(sig, "sha256=")
			if !hmac.Equal([]byte(expected), []byte(clean)) {
				http.Error(w, "invalid signature", http.StatusUnauthorized)
				return
			}
		}
	}

	// Persistir postback na tabela legacy affiliate_postbacks
	var payload json.RawMessage = body
	_, _ = h.db.ExecContext(r.Context(),
		`INSERT INTO affiliate_postbacks (program_id, payload, signature) VALUES ($1, $2, $3)`,
		prog.ID, payload, r.Header.Get("X-Signature"))

	// Inserir conversão na tabela affiliate_conversions (migration 0086)
	if h.store != nil {
		var convPayload struct {
			ExternalOrderID string  `json:"external_order_id"`
			Revenue         float64 `json:"revenue"`
			Status          string  `json:"status"`
		}
		_ = json.Unmarshal(body, &convPayload)
		if convPayload.Status == "" {
			convPayload.Status = "pending"
		}
		conv := models.AffiliateConversion{
			ProgramID: prog.ID,
			Status:    convPayload.Status,
		}
		if convPayload.ExternalOrderID != "" {
			conv.ExternalOrderID = models.NullString{NullString: sqlNullStr(convPayload.ExternalOrderID)}
		}
		if convPayload.Revenue != 0 {
			conv.Revenue = models.NullFloat64{NullFloat64: sqlNullF64(convPayload.Revenue)}
		}
		_, _ = h.store.InsertAffiliateConversion(conv)
	}

	w.WriteHeader(http.StatusOK)
}

func computeHMAC(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
