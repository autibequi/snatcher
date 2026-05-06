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

	// Resolver credenciais Evolution:
	// Prioridade: WA account ativo com instância > AppConfig global
	cfg, _ := st.GetConfig()
	waAccounts, _ := st.ListWAAccounts()

	baseURL  := cfg.WABaseURL.String
	apiKey   := cfg.WAApiKey.String
	instance := cfg.WAInstance.String
	var accountID int64

	for _, acc := range waAccounts {
		if !acc.Active { continue }
		// Pegar URL do account ou fallback para global
		accURL := baseURL
		if acc.BaseURL.Valid && acc.BaseURL.String != "" { accURL = acc.BaseURL.String }
		accKey := apiKey
		if acc.APIKey.Valid && acc.APIKey.String != "" { accKey = acc.APIKey.String }
		// SEMPRE usar a instância per-account se definida (evita "default")
		if acc.Instance.Valid && acc.Instance.String != "" {
			baseURL  = accURL
			apiKey   = accKey
			instance = acc.Instance.String
			accountID = acc.ID
			break
		}
	}

	if baseURL == "" {
		slog.Warn("dispatch worker: Evolution não configurada — disparos ignorados")
		return
	}

	for _, t := range targets {
		processTarget(ctx, st, t, baseURL, apiKey, instance, accountID)
	}
}

func processTarget(ctx context.Context, st store.Store, t models.DispatchTarget, baseURL, apiKey, instance string, accountID int64) {
	// Marcar como sending
	_ = st.UpdateDispatchTargetStatus(t.ID, "sending", "")
	_ = st.UpdateDispatchStatus(t.DispatchID, "sending")

	// Check throttle before sending
	if accountID > 0 {
		if err := st.CheckAndIncrementWA(accountID); err != nil {
			slog.Warn("throttle blocked dispatch send", "account", accountID, "target_id", t.ID, "err", err)
			_ = st.UpdateDispatchTargetStatus(t.ID, "failed", fmt.Sprintf("throttle: %v", err))
			checkAllFinished(st, t.DispatchID)
			return
		}
	}

	// Buscar dados do dispatch (mensagem)
	dispatch, err := st.GetDispatch(t.DispatchID)
	if err != nil {
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "dispatch não encontrado")
		return
	}

	// Extrair texto e media_url da mensagem
	var msg struct {
		Text     string `json:"text"`
		MediaURL string `json:"media_url"`
	}
	_ = json.Unmarshal(dispatch.Message, &msg)
	text := msg.Text

	// Buscar JID do grupo
	group, err := st.GetRedesignGroup(t.GroupID)
	if err != nil || !group.JID.Valid || group.JID.String == "" {
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "grupo sem JID configurado")
		checkAllFinished(st, t.DispatchID)
		return
	}
	jid := group.JID.String

	// Enviar imagem + texto OU só texto
	var errMsg string
	if msg.MediaURL != "" {
		errMsg = sendEvolutionMedia(ctx, baseURL, apiKey, instance, jid, msg.MediaURL, text)
	} else {
		errMsg = sendEvolutionMessage(ctx, baseURL, apiKey, instance, jid, text)
	}
	if errMsg != "" {
		slog.Warn("dispatch worker: send failed", "target_id", t.ID, "group", jid, "err", errMsg)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", errMsg)
	} else {
		slog.Info("dispatch worker: sent", "target_id", t.ID, "group", jid)
		_ = st.UpdateDispatchTargetStatus(t.ID, "delivered", "")
	}
	checkAllFinished(st, t.DispatchID)
}

func sendEvolutionMedia(ctx context.Context, baseURL, apiKey, instance, jid, mediaURL, caption string) string {
	body := fmt.Sprintf(`{"number":%q,"mediatype":"image","media":%q,"caption":%q}`,
		jid, mediaURL, caption)
	url := strings.TrimRight(baseURL, "/") + "/message/sendMedia/" + instance

	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(body))
	if err != nil {
		return err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", apiKey)

	// Timeout maior para media (base64 pode ser grande)
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		// Timeout ou erro de rede → tentar só texto
		slog.Warn("sendMedia falhou, fallback para texto", "err", err)
		return sendEvolutionMessage(ctx, baseURL, apiKey, instance, jid, caption)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		// HTTP error → fallback para texto
		return sendEvolutionMessage(ctx, baseURL, apiKey, instance, jid, caption)
	}
	return ""
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
		// Verificar se pelo menos 1 target foi entregue; senão marcar como failed
		hasDelivered, _ := st.HasDeliveredTarget(dispatchID)
		finalStatus := "completed"
		if !hasDelivered {
			finalStatus = "failed"
			slog.Warn("dispatch worker: todos os targets falharam", "dispatch_id", dispatchID)
		} else {
			slog.Info("dispatch worker: dispatch completed", "dispatch_id", dispatchID)
		}
		_ = st.UpdateDispatchStatus(dispatchID, finalStatus)
	}
}
