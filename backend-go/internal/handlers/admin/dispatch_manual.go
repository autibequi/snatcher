package admin

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"snatcher/backendv2/internal/adapters"
	"snatcher/backendv2/internal/store"
)

type ManualDispatchHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewManualDispatchHandler(st store.Store, db *sqlx.DB) *ManualDispatchHandler {
	return &ManualDispatchHandler{store: st, db: db}
}

// POST /api/dispatch/manual
// Body: { group_ids: [1,2,3], message: "texto", image_url?: "https://..." }
//
// Tenta inserir na send_queue para rastreabilidade.
// Se a migration 100013 ainda não rodou (catalog_id NOT NULL), cai para envio
// direto via Evolution API e registra em send_log manualmente.
func (h *ManualDispatchHandler) Send(w http.ResponseWriter, r *http.Request) {
	var req struct {
		GroupIDs []int64 `json:"group_ids"`
		Message  string  `json:"message"`
		ImageURL string  `json:"image_url"`
	}
	if err := decodeBody(r, &req); err != nil || len(req.GroupIDs) == 0 || req.Message == "" {
		writeErr(w, http.StatusBadRequest, "group_ids e message são obrigatórios")
		return
	}

	results := make([]map[string]any, 0, len(req.GroupIDs))
	for _, gid := range req.GroupIDs {
		result, err := h.sendToGroup(r.Context(), gid, req.Message, req.ImageURL)
		if err != nil {
			slog.Error("dispatch_manual: falhou", "group_id", gid, "err", err)
			results = append(results, map[string]any{"group_id": gid, "ok": false, "error": err.Error()})
		} else {
			results = append(results, result)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func (h *ManualDispatchHandler) sendToGroup(ctx context.Context, gid int64, message, imageURL string) (map[string]any, error) {
	// Tenta via send_queue (rastreável, respeita throttling).
	var queueID int64
	err := h.db.QueryRowContext(ctx, `
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
		SELECT a.id AS account_id, COALESCE(g.whatsapp_jid,'') AS jid, a.modem_id
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
		return nil, fmt.Errorf("grupo %d sem whatsapp_jid — importe o grupo em /admin/senders", gid)
	}

	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	if baseURL == "" {
		return nil, fmt.Errorf("Evolution URL não configurada — defina EVOLUTION_URL")
	}

	evo := adapters.NewEvolutionWithAccount(row.AccountID, baseURL, apiKey, instance)
	var sendErr error
	if imageURL != "" {
		sendErr = evo.SendImage(ctx, row.JID, imageURL, message)
	} else {
		sendErr = evo.SendText(ctx, row.JID, message)
	}
	if sendErr != nil {
		return nil, fmt.Errorf("Evolution API: %w", sendErr)
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

	slog.Info("dispatch_manual: enviado via Evolution API direta", "group", gid, "log_id", logID)
	return map[string]any{"group_id": gid, "ok": true, "log_id": logID, "method": "direct"}, nil
}
