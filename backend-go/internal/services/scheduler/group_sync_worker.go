package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jmoiron/sqlx"

	store "snatcher/backendv2/internal/repositories"
)

// RunGroupSyncWorker atualiza member_count dos grupos WA e auto-associa contas
// locais (primary/backup) aos grupos em que elas são participantes na Evolution.
// Roda a cada 30 minutos (job no scheduler).
func RunGroupSyncWorker(ctx context.Context, st store.Store, db *sqlx.DB) {
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

	// Buscar grupos da Evolution com participantes para auto-associar contas.
	url := fmt.Sprintf("%s/group/fetchAllGroups/%s?getParticipants=true", baseURL, instance)
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
		ID           string `json:"id"`
		Size         int    `json:"size"`
		Participants []struct {
			ID string `json:"id"` // "5511999999999@s.whatsapp.net"
		} `json:"participants"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&evoGroups); err != nil {
		slog.Warn("group sync: decode failed", "err", err)
		return
	}

	// Mapa JID → participantes (phones)
	type evoGroup struct {
		size         int
		participants map[string]struct{} // phone sem sufixo
	}
	evoByJID := map[string]*evoGroup{}
	for _, g := range evoGroups {
		eg := &evoGroup{size: g.Size, participants: map[string]struct{}{}}
		for _, p := range g.Participants {
			phone := strings.SplitN(p.ID, "@", 2)[0]
			eg.participants[phone] = struct{}{}
		}
		evoByJID[g.ID] = eg
	}

	// Contas locais primary/backup indexadas por phone
	accounts, err := st.ListAccountsV2()
	if err != nil {
		slog.Warn("group sync: list accounts failed", "err", err)
		return
	}
	accountByPhone := map[string]int64{}
	for _, a := range accounts {
		if a.Status == "primary" || a.Status == "backup" {
			accountByPhone[a.Phone] = a.ID
		}
	}

	// Atualizar member_count e auto-associar contas a grupos
	groups, err := st.ListRedesignGroups(0, "whatsapp", "")
	if err != nil {
		return
	}

	updatedCount := 0
	linkedCount := 0

	for _, g := range groups {
		if !g.JID.Valid || g.JID.String == "" {
			continue
		}
		eg, ok := evoByJID[g.JID.String]
		if !ok {
			continue
		}

		// Atualiza member_count se mudou
		if g.MemberCount != int64(eg.size) {
			g.MemberCount = int64(eg.size)
			_ = st.UpdateRedesignGroup(g)
			updatedCount++
		}

		// Auto-associa contas locais que são participantes do grupo
		if db == nil {
			continue
		}
		for phone, accountID := range accountByPhone {
			if _, isParticipant := eg.participants[phone]; !isParticipant {
				continue
			}
			var inserted bool
			err := db.QueryRowContext(ctx, `
				INSERT INTO group_admins (group_id, account_id, account_type)
				VALUES ($1, $2, 'wa')
				ON CONFLICT (group_id, account_type, account_id) DO NOTHING
				RETURNING true
			`, g.ID, accountID).Scan(&inserted)
			if err == nil && inserted {
				linkedCount++
				slog.Info("group sync: conta auto-associada ao grupo",
					"group_id", g.ID, "group", g.Name, "account_id", accountID, "phone", phone)
			}
		}
	}

	if updatedCount > 0 {
		slog.Info("group sync: updated member counts", "count", updatedCount)
	}
	if linkedCount > 0 {
		slog.Info("group sync: contas auto-associadas", "total", linkedCount)
	}
}
