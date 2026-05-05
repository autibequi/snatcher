package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// RunDispatchWorker processa dispatch_targets pendentes chamando a Evolution API.
// Deve ser chamado periodicamente pelo scheduler.
func RunDispatchWorker(ctx context.Context, st store.Store) {
	targets, err := st.ListPendingDispatchTargets(20)
	if err != nil {
		slog.Error("dispatch worker: list pending", "err", err)
		return
	}
	if len(targets) == 0 {
		return
	}
	slog.Info("dispatch worker: processing", "targets", len(targets))

	// Buscar config para credenciais Evolution
	cfg, err := st.GetConfig()
	if err != nil || !cfg.WABaseURL.Valid || cfg.WABaseURL.String == "" {
		slog.Warn("dispatch worker: Evolution não configurada — disparos ignorados")
		return
	}
	baseURL := cfg.WABaseURL.String
	apiKey := cfg.WAApiKey.String
	instance := cfg.WAInstance.String

	for _, t := range targets {
		processTarget(ctx, st, t, baseURL, apiKey, instance)
	}
}

func processTarget(ctx context.Context, st store.Store, t models.DispatchTarget, baseURL, apiKey, instance string) {
	// Marcar como sending
	_ = st.UpdateDispatchTargetStatus(t.ID, "sending", "")
	_ = st.UpdateDispatchStatus(t.DispatchID, "sending")

	// Buscar dados do dispatch (mensagem)
	dispatch, err := st.GetDispatch(t.DispatchID)
	if err != nil {
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "dispatch não encontrado")
		return
	}

	// Extrair texto da mensagem
	var msg struct{ Text string `json:"text"` }
	_ = json.Unmarshal(dispatch.Message, &msg)
	text := msg.Text
	if t.GroupID > 0 {
		text += "\n\n" + dispatch.AffiliateLink
	}

	// Buscar JID do grupo
	group, err := st.GetRedesignGroup(t.GroupID)
	if err != nil || !group.JID.Valid || group.JID.String == "" {
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "grupo sem JID configurado")
		checkAllFinished(st, t.DispatchID)
		return
	}
	jid := group.JID.String

	// Enviar via Evolution API
	errMsg := sendEvolutionMessage(ctx, baseURL, apiKey, instance, jid, text)
	if errMsg != "" {
		slog.Warn("dispatch worker: send failed", "target_id", t.ID, "group", jid, "err", errMsg)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", errMsg)
	} else {
		slog.Info("dispatch worker: sent", "target_id", t.ID, "group", jid)
		_ = st.UpdateDispatchTargetStatus(t.ID, "delivered", "")
	}
	checkAllFinished(st, t.DispatchID)
}

func sendEvolutionMessage(ctx context.Context, baseURL, apiKey, instance, jid, text string) string {
	body := fmt.Sprintf(`{"number":%q,"text":%q}`, jid, text)
	url := strings.TrimRight(baseURL, "/") + "/message/sendText/" + instance

	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(body))
	if err != nil {
		return err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err.Error()
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Sprintf("evolution status %d", resp.StatusCode)
	}
	return ""
}

func checkAllFinished(st store.Store, dispatchID int64) {
	done, err := st.AllDispatchTargetsFinished(dispatchID)
	if err == nil && done {
		_ = st.UpdateDispatchStatus(dispatchID, "completed")
		slog.Info("dispatch worker: dispatch completed", "dispatch_id", dispatchID)
	}
}
