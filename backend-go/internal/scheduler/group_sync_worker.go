package scheduler

import (
	"context"
	"log/slog"
	"net/http"
	"encoding/json"
	"fmt"

	"snatcher/backendv2/internal/store"
)

// RunGroupSyncWorker atualiza member_count dos grupos WA usando a Evolution API.
// Roda a cada 30 minutos (job no scheduler).
func RunGroupSyncWorker(ctx context.Context, st store.Store) {
	cfg, err := st.GetConfig()
	if err != nil {
		return
	}
	if !cfg.WABaseURL.Valid || cfg.WABaseURL.String == "" {
		return
	}
	baseURL := cfg.WABaseURL.String
	apiKey := cfg.WAApiKey.String
	instance := cfg.WAInstance.String
	if instance == "" {
		instance = "default"
	}

	// Buscar grupos da Evolution
	url := fmt.Sprintf("%s/group/fetchAllGroups/%s?getParticipants=false", baseURL, instance)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return
	}
	req.Header.Set("apikey", apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("group sync: evolution request failed", "err", err)
		return
	}
	defer resp.Body.Close()

	var evoGroups []struct {
		ID   string `json:"id"`
		Size int    `json:"size"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&evoGroups); err != nil {
		return
	}

	// Indexar por JID
	sizeByJID := map[string]int{}
	for _, g := range evoGroups {
		sizeByJID[g.ID] = g.Size
	}

	// Atualizar groups no DB usando métodos existentes
	groups, err := st.ListRedesignGroups(0, "whatsapp", "")
	if err != nil {
		return
	}
	updated := 0
	for _, g := range groups {
		if !g.JID.Valid || g.JID.String == "" {
			continue
		}
		if size, ok := sizeByJID[g.JID.String]; ok && g.MemberCount != int64(size) {
			g.MemberCount = int64(size)
			_ = st.UpdateRedesignGroup(g)
			updated++
		}
	}
	if updated > 0 {
		slog.Info("group sync: updated member counts", "count", updated)
	}
}
