package admin

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"snatcher/backendv2/internal/adapters"
	"snatcher/backendv2/internal/store"
)

type ManualDispatchHandler struct {
	store store.Store
}

func NewManualDispatchHandler(st store.Store) *ManualDispatchHandler {
	return &ManualDispatchHandler{store: st}
}

// POST /api/dispatch/manual
// Body: { group_ids: [1,2,3], message: "texto", image_url?: "https://..." }
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

	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	if baseURL == "" {
		writeErr(w, http.StatusServiceUnavailable, "Evolution API não configurada")
		return
	}

	evo := adapters.NewEvolutionWithAccount(0, baseURL, apiKey, instance)

	results := make([]map[string]any, 0, len(req.GroupIDs))
	for _, gid := range req.GroupIDs {
		g, err := h.store.GetRedesignGroup(gid)
		if err != nil {
			results = append(results, map[string]any{"group_id": gid, "ok": false, "error": "grupo não encontrado"})
			continue
		}
		jid := ""
		if g.WhatsappJID.Valid {
			jid = g.WhatsappJID.String
		} else if g.JID.Valid {
			jid = g.JID.String
		}
		if jid == "" {
			results = append(results, map[string]any{"group_id": gid, "ok": false, "error": "grupo sem JID"})
			continue
		}
		var sendErr error
		if req.ImageURL != "" {
			sendErr = evo.SendImage(context.Background(), jid, req.ImageURL, req.Message)
		} else {
			sendErr = evo.SendText(context.Background(), jid, req.Message)
		}
		if sendErr != nil {
			results = append(results, map[string]any{"group_id": gid, "ok": false, "error": fmt.Sprintf("%v", sendErr)})
		} else {
			results = append(results, map[string]any{"group_id": gid, "ok": true})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}
