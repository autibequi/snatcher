package admin

import (
	"net/http"

	"github.com/jmoiron/sqlx"
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
// Insere na send_queue (não vai direto para a Evolution API).
// O worker de sender processa a fila e envia respeitando throttling/anti-ban.
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
		// Resolve conta WA primary/backup e seu modem via group_admins.
		var queueID int64
		err := h.db.QueryRowContext(r.Context(), `
			INSERT INTO send_queue
			    (modem_id, group_id, catalog_id, account_id, message_override, image_url_override, source, status, enqueued_at)
			SELECT
			    a.modem_id,
			    $1,
			    NULL,
			    a.id,
			    $2,
			    NULLIF($3, ''),
			    'manual',
			    'pending',
			    now()
			FROM accounts a
			JOIN group_admins ga ON ga.account_id = a.id
			WHERE ga.group_id = $1
			  AND a.status IN ('primary', 'backup')
			ORDER BY CASE a.status WHEN 'primary' THEN 0 ELSE 1 END, ga.added_at ASC
			LIMIT 1
			RETURNING id
		`, gid, req.Message, req.ImageURL).Scan(&queueID)

		if err != nil {
			results = append(results, map[string]any{
				"group_id": gid, "ok": false,
				"error": "sem conta WA primary/backup vinculada ao grupo — vincule em /admin/senders",
			})
			continue
		}
		results = append(results, map[string]any{"group_id": gid, "ok": true, "queue_id": queueID})
	}

	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}
