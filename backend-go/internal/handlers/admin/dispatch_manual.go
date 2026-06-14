package admin

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"snatcher/backendv2/internal/services/messaging"
	store "snatcher/backendv2/internal/repositories"
)

type ManualDispatchHandler struct {
	store       store.Store
	db          *sqlx.DB
	// msgRegistry permite obter o Gateway de mensageria sem acoplamento ao adapter concreto.
	msgRegistry *messaging.Registry
}

// NewManualDispatchHandler cria um ManualDispatchHandler com store, db e registry de mensageria.
func NewManualDispatchHandler(st store.Store, db *sqlx.DB, reg *messaging.Registry) *ManualDispatchHandler {
	return &ManualDispatchHandler{store: st, db: db, msgRegistry: reg}
}

// POST /api/dispatch/manual
// Body: { group_ids: [1,2,3], message: "texto", image_url?: "https://...", scheduled_for?: "2026-05-18T10:00:00Z" }
//
// Tenta inserir na send_queue para rastreabilidade.
// Quando scheduled_for é fornecido, usa esse timestamp como enqueued_at,
// fazendo o worker processar o item no momento agendado (ORDER BY enqueued_at ASC).
// Se a migration 100013 ainda não rodou (catalog_id NOT NULL), cai para envio
// direto via messaging.Gateway e registra em send_log manualmente.
func (h *ManualDispatchHandler) Send(w http.ResponseWriter, r *http.Request) {
	var req struct {
		GroupIDs     []int64 `json:"group_ids"`
		Message      string  `json:"message"`
		ImageURL     string  `json:"image_url"`
		ScheduledFor string  `json:"scheduled_for"`
	}
	if err := decodeBody(r, &req); err != nil || len(req.GroupIDs) == 0 || req.Message == "" {
		writeErr(w, http.StatusBadRequest, "group_ids e message são obrigatórios")
		return
	}

	// Resolve o timestamp de agendamento quando fornecido.
	// Se ausente ou inválido, usa now() (disparo imediato).
	var enqueuedAt *time.Time
	if req.ScheduledFor != "" {
		parsed, err := time.Parse(time.RFC3339, req.ScheduledFor)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "scheduled_for deve estar no formato RFC3339 (ex: 2026-05-18T10:00:00Z)")
			return
		}
		if parsed.Before(time.Now()) {
			writeErr(w, http.StatusBadRequest, "scheduled_for deve ser um momento no futuro")
			return
		}
		enqueuedAt = &parsed
	}

	results := make([]map[string]any, 0, len(req.GroupIDs))
	for _, gid := range req.GroupIDs {
		result, err := h.sendToGroup(r.Context(), gid, req.Message, req.ImageURL, enqueuedAt)
		if err != nil {
			slog.Error("dispatch_manual: falhou", "group_id", gid, "err", err)
			results = append(results, map[string]any{"group_id": gid, "ok": false, "error": err.Error()})
		} else {
			results = append(results, result)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func (h *ManualDispatchHandler) sendToGroup(ctx context.Context, gid int64, message, imageURL string, enqueuedAt *time.Time) (map[string]any, error) {
	// Tenta via send_queue (rastreável, respeita throttling).
	// scheduled_for presente: usa o timestamp fornecido como enqueued_at.
	var queueID int64
	var err error
	if enqueuedAt != nil {
		err = h.db.QueryRowContext(ctx, `
			INSERT INTO send_queue
			    (modem_id, group_id, catalog_id, account_id, message_override, image_url_override, source, status, enqueued_at)
			SELECT a.modem_id, $1, NULL, a.id, $2, NULLIF($3,''), 'manual', 'pending', $4
			FROM accounts a
			JOIN group_admins ga ON ga.account_id = a.id
			WHERE ga.group_id = $1 AND a.status IN ('primary','backup')
			ORDER BY CASE a.status WHEN 'primary' THEN 0 ELSE 1 END, ga.added_at ASC
			LIMIT 1
			RETURNING id
		`, gid, message, imageURL, *enqueuedAt).Scan(&queueID)
	} else {
		err = h.db.QueryRowContext(ctx, `
			INSERT INTO send_queue
			    (modem_id, group_id, catalog_id, account_id, message_override, image_url_override, source, status, enqueued_at)
			SELECT a.modem_id, $1, NULL, a.id, $2, NULLIF($3,''), 'manual', 'pending', now()
			FROM accounts a
			JOIN group_admins ga ON ga.account_id = a.id
			WHERE ga.group_id = $1 AND a.status IN ('primary','backup')
			ORDER BY CASE a.status WHEN 'primary' THEN 0 ELSE 1 END, ga.added_at ASC
			LIMIT 1
			RETURNING id
		`, gid, message, imageURL).Scan(&queueID)
	}

	if err == nil {
		// Enfileirado com sucesso — worker vai enviar.
		return map[string]any{"group_id": gid, "ok": true, "queue_id": queueID, "method": "queue"}, nil
	}

	// Verifica se é NOT NULL constraint (migration 100013 ainda não rodou).
	isNotNullErr := false
	if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23502" {
		isNotNullErr = true
	} else if strings.Contains(err.Error(), "null value in column") || strings.Contains(err.Error(), "not-null") {
		isNotNullErr = true
	}

	if isNotNullErr {
		// Fallback: envio direto + registro manual em send_log.
		slog.Warn("dispatch_manual: send_queue não suporta catalog_id=NULL ainda, usando envio direto", "group", gid)
		return h.sendDirect(ctx, gid, message, imageURL)
	}

	// Erro diferente (sem conta WA, grupo não existe, etc.)
	return nil, fmt.Errorf("sem conta WA primary/backup vinculada ao grupo %d — vincule em /admin/senders", gid)
}

func (h *ManualDispatchHandler) sendDirect(ctx context.Context, gid int64, message, imageURL string) (map[string]any, error) {
	// Resolve conta WA e JID do grupo.
	var row struct {
		AccountID int64  `db:"account_id"`
		JID       string `db:"jid"`
		ModemID   int64  `db:"modem_id"`
	}
	err := h.db.GetContext(ctx, &row, `
		SELECT a.id AS account_id, COALESCE(g.jid,'') AS jid, a.modem_id
		FROM accounts a
		JOIN group_admins ga ON ga.account_id = a.id
		JOIN groups g ON g.id = ga.group_id
		WHERE ga.group_id = $1 AND a.status IN ('primary','backup')
		ORDER BY CASE a.status WHEN 'primary' THEN 0 ELSE 1 END LIMIT 1
	`, gid)
	if err != nil {
		return nil, fmt.Errorf("sem conta WA primary/backup vinculada ao grupo — vincule em /admin/senders")
	}
	if row.JID == "" {
		return nil, fmt.Errorf("grupo %d sem jid — importe o grupo em /admin/senders", gid)
	}

	// Obtém o gateway WA do registry — desacopla do adapter Evolution concreto.
	gw, err := h.getWAGateway()
	if err != nil {
		return nil, err
	}

	target := messaging.Target{
		GroupID:  gid,
		RemoteID: row.JID,
		Platform: messaging.PlatformWhatsApp,
	}

	var sendErr error
	if imageURL != "" {
		// Envia como mídia com legenda.
		_, sendErr = gw.SendMedia(ctx, target, messaging.Media{URL: imageURL}, message, messaging.SendOpts{})
	} else {
		_, sendErr = gw.SendText(ctx, target, message, messaging.SendOpts{})
	}
	if sendErr != nil {
		return nil, fmt.Errorf("messaging gateway: %w", sendErr)
	}

	// Registra em send_log para aparecer na aba Activities.
	var logID int64
	_ = h.db.QueryRowContext(ctx, `
		INSERT INTO send_log (group_id, account_id, catalog_id, status, sent_at)
		VALUES ($1, $2, NULL, 'sent', now())
		RETURNING id
	`, gid, row.AccountID).Scan(&logID)

	// Atualiza last_sent_at da conta.
	_, _ = h.db.ExecContext(ctx, `UPDATE accounts SET last_sent_at=now(), consecutive_failures=0 WHERE id=$1`, row.AccountID)

	slog.Info("dispatch_manual: enviado via messaging gateway", "group", gid, "log_id", logID)
	return map[string]any{"group_id": gid, "ok": true, "log_id": logID, "method": "direct"}, nil
}

// getWAGateway retorna o gateway WhatsApp do registry.
// Retorna erro se o registry não está configurado ou o provider WA não foi registrado.
func (h *ManualDispatchHandler) getWAGateway() (messaging.Gateway, error) {
	if h.msgRegistry == nil {
		return nil, fmt.Errorf("messaging registry não configurado — verifique EVOLUTION_URL")
	}
	gw, err := h.msgRegistry.Get(string(messaging.PlatformWhatsApp))
	if err != nil {
		return nil, fmt.Errorf("WhatsApp gateway não registrado — configure EVOLUTION_URL")
	}
	return gw, nil
}
