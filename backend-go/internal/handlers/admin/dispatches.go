package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// DispatchHandler handles POST/GET /api/dispatches.
type DispatchHandler struct {
	store store.Store
	db    *sqlx.DB
	llmFn func() llm.Client
}

// NewDispatchHandler cria um DispatchHandler.
func NewDispatchHandler(st store.Store, db *sqlx.DB) *DispatchHandler {
	return &DispatchHandler{store: st, db: db}
}

func (h *DispatchHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }

type dispatchTargetReq struct {
	GroupID   *int64 `json:"group_id"`
	ChannelID *int64 `json:"channel_id"`
}

type createDispatchReq struct {
	ProductID     *int64              `json:"product_id"`
	Message       map[string]any      `json:"message"`
	AffiliateLink string              `json:"affiliate_link"`
	Targets       []dispatchTargetReq `json:"targets"`
	ScheduledFor  *string             `json:"scheduled_for"`
}

// Create handles POST /api/dispatches.
func (h *DispatchHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createDispatchReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	isDraft := len(req.Targets) == 0

	// Validação P7: envio (não-rascunho) exige link com código de afiliado.
	// Se o link já vem pronto (req.AffiliateLink), aceitamos. Senão, exige produto + programa configurado.
	if !isDraft {
		hasLink := req.AffiliateLink != ""
		if !hasLink && req.ProductID != nil {
			prod, err := h.store.GetCatalogProduct(*req.ProductID)
			if err == nil && prod.LowestPriceURL.Valid && prod.LowestPriceURL.String != "" {
				src := ""
				if prod.LowestPriceSource.Valid {
					src = prod.LowestPriceSource.String
				}
				progs, _ := h.store.ListAffiliatePrograms(nil)
				if affiliates.HasAffiliate(src, progs) {
					hasLink = true
				}
			}
		}
		if !hasLink {
			writeErr(w, http.StatusUnprocessableEntity,
				"código de afiliado obrigatório — configure um programa para o marketplace deste produto antes de disparar")
			return
		}
	}

	msgBytes, _ := json.Marshal(req.Message)
	if msgBytes == nil {
		msgBytes = []byte("{}")
	}

	d := models.Dispatch{
		ComposedBy:    "manual",
		Message:       msgBytes,
		AffiliateLink: req.AffiliateLink,
	}
	if req.ProductID != nil {
		d.ProductID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.ProductID, Valid: true}}
	}
	if req.ScheduledFor != nil && *req.ScheduledFor != "" {
		formats := []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02T15:04:05"}
		for _, f := range formats {
			if t, err := time.ParseInLocation(f, *req.ScheduledFor, time.Local); err == nil {
				d.ScheduledFor = models.NullTime{NullTime: sql.NullTime{Time: t, Valid: true}}
				break
			}
		}
	}

	// Resolve targets: GroupID direto OU expandir ChannelID -> grupos ativos.
	var targets []models.DispatchTarget
	for _, t := range req.Targets {
		if t.GroupID != nil {
			targets = append(targets, models.DispatchTarget{GroupID: *t.GroupID})
		} else if t.ChannelID != nil {
			groups, err := h.store.ListRedesignGroups(*t.ChannelID, "", "active")
			if err == nil {
				for _, g := range groups {
					targets = append(targets, models.DispatchTarget{GroupID: g.ID})
				}
			}
		}
	}
	// Se não há targets → salvar como rascunho (sem envio)
	if isDraft || len(targets) == 0 {
		d.Status = "draft"
		id, err := h.store.CreateDispatch(d, nil)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao salvar rascunho")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"id":     id,
			"status": "draft",
		})
		return
	}

	id, err := h.store.CreateDispatch(d, targets)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar dispatch")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":            id,
		"targets_count": len(targets),
		"status":        "queued",
	})
}

// List handles GET /api/dispatches.
func (h *DispatchHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	dispatches, err := h.store.ListDispatches(status, 50, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar dispatches")
		return
	}
	if dispatches == nil {
		dispatches = []models.Dispatch{}
	}
	writeJSON(w, http.StatusOK, dispatches)
}

// Get handles GET /api/dispatches/:id.
func (h *DispatchHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	d, err := h.store.GetDispatch(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "dispatch nao encontrado")
		return
	}
	targets, _ := h.store.ListDispatchTargets(id)
	if targets == nil {
		targets = []models.DispatchTarget{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"dispatch": d,
		"targets":  targets,
	})
}

// Cancel handles POST /api/dispatches/:id/cancel.
// Marca dispatch draft/queued como failed. Retorna 409 se já está sending/completed.
func (h *DispatchHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	d, err := h.store.GetDispatch(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "dispatch nao encontrado")
		return
	}
	if d.Status == "sending" || d.Status == "completed" {
		writeErr(w, http.StatusConflict, "dispatch ja esta em andamento ou concluido")
		return
	}

	if err := h.store.CancelDispatch(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao cancelar dispatch")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
}

// ListPendingApproval GET /api/dispatches/pending-approval
// Retorna dispatches aguardando aprovação humana (full_auto_mode=false).
func (h *DispatchHandler) ListPendingApproval(w http.ResponseWriter, r *http.Request) {
	var rows []struct {
		ID            int64    `db:"id" json:"id"`
		Status        string   `db:"status" json:"status"`
		ComposedBy    string   `db:"composed_by" json:"composed_by"`
		AffiliateLink string   `db:"affiliate_link" json:"affiliate_link"`
		ChannelID     *int64   `db:"channel_id" json:"channel_id,omitempty"`
		ChannelName   *string  `db:"channel_name" json:"channel_name,omitempty"`
		ProductName   *string  `db:"product_name" json:"product_name,omitempty"`
		Score         *float64 `db:"score" json:"score,omitempty"`
		CreatedAt     string   `db:"created_at" json:"created_at"`
	}
	err := h.db.SelectContext(r.Context(), &rows, `
		SELECT d.id, d.status, d.composed_by,
		       COALESCE(d.affiliate_link, '') AS affiliate_link,
		       aml.channel_id,
		       ch.name AS channel_name,
		       cp.canonical_name AS product_name,
		       aml.score,
		       to_char(d.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS created_at
		FROM dispatches d
		LEFT JOIN auto_match_logs aml ON aml.dispatch_id = d.id
		LEFT JOIN channel ch ON ch.id = aml.channel_id
		LEFT JOIN catalogproduct cp ON cp.id = aml.product_id
		WHERE d.status = 'pending_approval'
		ORDER BY d.created_at DESC
		LIMIT 50`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = rows[:0]
	}
	writeJSON(w, http.StatusOK, rows)
}

// ApproveDispatch POST /api/dispatches/{id}/approve
// Muda status de pending_approval → queued para envio imediato.
func (h *DispatchHandler) ApproveDispatch(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, err := h.db.ExecContext(r.Context(), `
		UPDATE dispatches SET status = 'queued' WHERE id = $1 AND status = 'pending_approval'`, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// RejectDispatch POST /api/dispatches/{id}/reject
// Descarta dispatch pendente de aprovação.
func (h *DispatchHandler) RejectDispatch(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, err := h.db.ExecContext(r.Context(), `
		UPDATE dispatches SET status = 'failed' WHERE id = $1 AND status = 'pending_approval'`, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ApproveAllDispatch POST /api/dispatches/approve-all
// Aprova todos os dispatches pendentes de uma vez.
func (h *DispatchHandler) ApproveAllDispatch(w http.ResponseWriter, r *http.Request) {
	res, err := h.db.ExecContext(r.Context(), `
		UPDATE dispatches SET status = 'queued' WHERE status = 'pending_approval'`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	writeJSON(w, http.StatusOK, map[string]any{"approved": n})
}

// ExpireStaleTargets POST /api/dispatches/expire-stale
// Marca como 'failed' todos os dispatch_targets com status='pending' há mais de 2h.
// Também atualiza dispatches para 'failed' se todos os targets estiverem concluídos.
func (h *DispatchHandler) ExpireStaleTargets(w http.ResponseWriter, r *http.Request) {
	res, err := h.db.ExecContext(r.Context(), `
		UPDATE dispatch_targets
		SET status = 'failed',
		    error_reason = 'expirado automaticamente (pendente há mais de 2h)'
		WHERE status = 'pending'
		  AND created_at < now() - interval '2 hours'`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	expired, _ := res.RowsAffected()

	// Atualiza dispatches que agora não têm mais targets pending
	_, _ = h.db.ExecContext(r.Context(), `
		UPDATE dispatches d SET status = 'failed'
		WHERE d.status IN ('sending', 'queued', 'scheduled')
		  AND NOT EXISTS (
		      SELECT 1 FROM dispatch_targets dt
		      WHERE dt.dispatch_id = d.id AND dt.status IN ('pending', 'sending')
		  )
		  AND EXISTS (
		      SELECT 1 FROM dispatch_targets dt
		      WHERE dt.dispatch_id = d.id AND dt.status = 'failed'
		  )`)

	writeJSON(w, http.StatusOK, map[string]any{"expired_targets": expired})
}

// Diagnose POST /api/dispatches/:id/diagnose
// Usa LLM para analisar targets com falha e sugerir causa raiz e ações corretivas.
func (h *DispatchHandler) Diagnose(w http.ResponseWriter, r *http.Request) {
	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}

	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	dispatch, err := h.store.GetDispatch(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "dispatch não encontrado")
		return
	}

	targets, err := h.store.ListDispatchTargets(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar targets")
		return
	}

	// Sumarizar erros únicos
	errCount := map[string]int{}
	for _, t := range targets {
		if t.Status == "failed" && t.ErrorReason.Valid && t.ErrorReason.String != "" {
			errCount[t.ErrorReason.String]++
		}
	}
	sort.Slice(targets, func(i, j int) bool { return targets[i].Status < targets[j].Status })

	totalFailed := 0
	for _, t := range targets {
		if t.Status == "failed" {
			totalFailed++
		}
	}

	var errLines []string
	for reason, count := range errCount {
		errLines = append(errLines, fmt.Sprintf("- %dx: %s", count, reason))
	}
	sort.Strings(errLines)

	snapshot := fmt.Sprintf(`Dispatch #%d — status: %s — criado: %s
Targets: %d total, %d falhas, %d entregues
Erros encontrados:
%s`,
		dispatch.ID, dispatch.Status, dispatch.CreatedAt.Format("02/01 15:04"),
		len(targets), totalFailed, len(targets)-totalFailed,
		strings.Join(errLines, "\n"),
	)

	prompt := fmt.Sprintf(`Você é engenheiro de confiabilidade de sistemas de mensageria WhatsApp/Telegram.
Analise este snapshot de disparo com falhas e identifique: causa raiz, se é problema transiente ou estrutural, e ações corretivas concretas.

SNAPSHOT:
%s

Responda EXCLUSIVAMENTE em JSON:
{
  "likely_cause": "causa raiz em 1 frase",
  "diagnosis": "análise técnica em 2-3 frases",
  "is_transient": true/false,
  "actions": ["ação 1", "ação 2", "ação 3"]
}`, snapshot)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   400,
		Temperature: 0.2,
		Operation:   "diagnose_dispatch",
		JSONMode:    true,
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "LLM: "+err.Error())
		return
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		writeErr(w, http.StatusBadGateway, "LLM resposta inválida")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
