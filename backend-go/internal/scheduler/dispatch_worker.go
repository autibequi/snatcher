package scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"snatcher/backendv2/internal/debugagent"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// inDispatchSendWindow retorna true se o envio via Evolution pode ocorrer agora,
// usando send_start_hour/send_end_hour da AppConfig no fuso dispatch_send_timezone (IANA).
// Com dispatch_send_window_enabled=false, sempre true (envio 24h).
func inDispatchSendWindow(cfg models.AppConfig, now time.Time) bool {
	if !cfg.DispatchSendWindowEnabled {
		return true
	}
	tzName := strings.TrimSpace(cfg.DispatchSendTimezone)
	if tzName == "" {
		tzName = "America/Sao_Paulo"
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		slog.Warn("dispatch send window: timezone inválido, usando UTC", "tz", tzName, "err", err)
		loc = time.UTC
	}
	h := now.In(loc).Hour()
	start, end := cfg.SendStartHour, cfg.SendEndHour
	// Mesma semântica que pipeline.inSendWindow: [start, end)
	return h >= start && h < end
}

// InDispatchSendWindow exportado para handlers/admin e diagnóstico (mesma regra do worker).
func InDispatchSendWindow(cfg models.AppConfig, now time.Time) bool {
	return inDispatchSendWindow(cfg, now)
}

// RunDispatchWorker processa dispatch_targets pendentes chamando a Evolution API.
// Deve ser chamado periodicamente pelo scheduler.
// Retorna quantos targets foram lidos da fila neste ciclo (0 = fila vazia ou erro ao listar).
func RunDispatchWorker(ctx context.Context, st store.Store) int {
	cfg, err := st.GetConfig()
	if err != nil {
		slog.Error("dispatch worker: get config", "err", err)
		return 0
	}
	winOK := inDispatchSendWindow(cfg, time.Now())
	// #region agent log
	debugagent.Write("H2", "dispatch_worker.go:RunDispatchWorker", "pre_tick", map[string]any{
		"in_send_window":           winOK,
		"dispatch_window_enabled": cfg.DispatchSendWindowEnabled,
		"send_tz":                 cfg.DispatchSendTimezone,
		"send_start_h":            cfg.SendStartHour,
		"send_end_h":              cfg.SendEndHour,
	}, "")
	// #endregion
	if !winOK {
		slog.Info("dispatch worker: fora da janela de envio — mensagens ficam na fila até o horário permitido",
			"tz", cfg.DispatchSendTimezone,
			"start_h", cfg.SendStartHour, "end_h", cfg.SendEndHour)
		return 0
	}

	targets, err := st.ListPendingDispatchTargets(20)
	if err != nil {
		slog.Error("dispatch worker: list pending", "err", err)
		return 0
	}
	// #region agent log
	debugagent.Write("H1", "dispatch_worker.go:RunDispatchWorker", "pending_targets_fetched", map[string]any{
		"count": len(targets),
	}, "")
	// #endregion
	if len(targets) == 0 {
		slog.Info("[dbg_dispatch] worker tick: nenhum dispatch_target pending ligado a dispatch queued/sending (ou agendado futuro)")
		return 0
	}
	n := len(targets)
	slog.Info("dispatch worker: processing", "targets", n)
	waAccounts, err := st.ListWAAccounts()
	if err != nil {
		slog.Warn("dispatch worker: list WA accounts", "err", err)
		waAccounts = nil
	}

	// Rate limit por grupo: default 3 mensagens/hora por grupo (anti-spam, evita ban WA).
	// Conta dispatches já entregues nas últimas 60min para o grupo. Se >= limit, pula este target neste ciclo.
	const maxPerGroupPerHour = 3
	type groupCount struct {
		GroupID int64 `db:"group_id"`
		Count   int   `db:"count"`
	}
	deliveredByGroup := make(map[int64]int, len(targets))
	if hdb, ok := st.(interface{ DB() interface{} }); ok {
		_ = hdb // placeholder se store expõe db
	}
	// Usa método helper se disponível, senão conta via store
	var counts []groupCount
	if cs, err := st.CountRecentDeliveriesByGroup(60); err != nil {
		slog.Warn("dispatch worker: count recent deliveries by group", "err", err)
	} else {
		counts = make([]groupCount, len(cs))
		for i, c := range cs {
			counts[i] = groupCount{GroupID: c.GroupID, Count: c.Count}
		}
	}
	for _, c := range counts {
		deliveredByGroup[c.GroupID] = c.Count
	}

	rrCursor := cfg.DispatchWaRRCursor
	for i, t := range targets {
		if cfg.DispatchMinIntervalMs > 0 && i > 0 {
			d := time.Duration(cfg.DispatchMinIntervalMs) * time.Millisecond
			select {
			case <-ctx.Done():
				return n
			case <-time.After(d):
			}
		}
		if deliveredByGroup[t.GroupID] >= maxPerGroupPerHour {
			slog.Warn("dispatch worker: rate limit por grupo, target adiado", "target_id", t.ID, "dispatch_id", t.DispatchID, "group_id", t.GroupID, "delivered_60min", deliveredByGroup[t.GroupID], "limit", maxPerGroupPerHour)
			continue // deixa pending — próximo ciclo tenta de novo
		}
		if processTarget(ctx, st, t, cfg, waAccounts, &rrCursor) {
			deliveredByGroup[t.GroupID]++
		}
	}
	if rrCursor != cfg.DispatchWaRRCursor {
		if err := st.SetDispatchWaRRCursor(rrCursor); err != nil {
			slog.Warn("dispatch worker: persist wa rr cursor", "err", err)
		}
	}
	return n
}

// evolutionSendBodyError detecta erro em JSON mesmo com HTTP 2xx (Evolution às vezes não usa 4xx).
func evolutionSendBodyError(body []byte) string {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return ""
	}
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		return ""
	}
	if v, ok := m["error"]; ok {
		switch e := v.(type) {
		case string:
			if strings.TrimSpace(e) != "" {
				return e
			}
		case bool:
			if e {
				return "error: true"
			}
		case float64:
			if e != 0 {
				return fmt.Sprintf("error code %v", e)
			}
		}
	}
	if st, ok := m["status"].(float64); ok && st >= 400 {
		if msg, ok := m["message"].(string); ok && msg != "" {
			return msg
		}
		return fmt.Sprintf("status JSON %v", st)
	}
	if msg, ok := m["message"].(string); ok && msg != "" {
		// Algumas versões retornam falha só em message
		if strings.Contains(strings.ToLower(msg), "instance") && strings.Contains(strings.ToLower(msg), "closed") {
			return msg
		}
	}
	return ""
}

func sortedActiveWAAccountsWithInstance(cfg models.AppConfig, waAccounts []models.WAAccount) []models.WAAccount {
	var cands []models.WAAccount
	for _, acc := range waAccounts {
		if !acc.Active || !acc.Instance.Valid || strings.TrimSpace(acc.Instance.String) == "" {
			continue
		}
		cands = append(cands, acc)
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].ID < cands[j].ID })
	return cands
}

// resolveEvolutionCredentials escolhe URL/apiKey/instance por target.
// Prioridade: dispatch_targets.wa_account_id > groups.wa_account_id > round-robin entre contas ativas com instance (rrCursor) > primeira conta > só config global.
func resolveEvolutionCredentials(st store.Store, cfg models.AppConfig, waAccounts []models.WAAccount, t models.DispatchTarget, group models.RedesignGroup, rrCursor *int) (baseURL, apiKey, instance string, accountID int64, err error) {
	preferredID := int64(0)
	if t.WAAccountID.Valid && t.WAAccountID.Int64 > 0 {
		preferredID = t.WAAccountID.Int64
	} else if group.WAAccountID.Valid && group.WAAccountID.Int64 > 0 {
		preferredID = group.WAAccountID.Int64
	}

	if preferredID > 0 {
		acc, e := st.GetWAAccount(preferredID)
		if e != nil {
			return "", "", "", 0, fmt.Errorf("conta WA %d não encontrada", preferredID)
		}
		if !acc.Active {
			return "", "", "", 0, fmt.Errorf("conta WA %d inativa", preferredID)
		}
		b, k, inst := mergeEvolutionFromConfig(cfg, &acc)
		if b == "" {
			return "", "", "", 0, fmt.Errorf("Evolution sem URL (config global ou conta %d)", preferredID)
		}
		if inst == "" {
			return "", "", "", 0, fmt.Errorf("Evolution sem instance (config global ou conta %d)", preferredID)
		}
		return b, k, inst, acc.ID, nil
	}

	cands := sortedActiveWAAccountsWithInstance(cfg, waAccounts)
	if len(cands) > 0 && rrCursor != nil && len(cands) > 1 {
		idx := (*rrCursor%len(cands) + len(cands)) % len(cands)
		acc := cands[idx]
		*rrCursor++
		b, k, inst := mergeEvolutionFromConfig(cfg, &acc)
		if b != "" && inst != "" {
			return b, k, inst, acc.ID, nil
		}
	} else if len(cands) > 0 {
		acc := cands[0]
		b, k, inst := mergeEvolutionFromConfig(cfg, &acc)
		if b != "" && inst != "" {
			return b, k, inst, acc.ID, nil
		}
	}

	// Mesmo critério histórico do worker: primeira conta ativa com instance definido no registro.
	baseURL = cfg.WABaseURL.String
	apiKey = cfg.WAApiKey.String
	instance = cfg.WAInstance.String
	for _, acc := range waAccounts {
		if !acc.Active {
			continue
		}
		accURL := baseURL
		if acc.BaseURL.Valid && acc.BaseURL.String != "" {
			accURL = acc.BaseURL.String
		}
		accKey := apiKey
		if acc.APIKey.Valid && acc.APIKey.String != "" {
			accKey = acc.APIKey.String
		}
		if acc.Instance.Valid && acc.Instance.String != "" {
			return accURL, accKey, acc.Instance.String, acc.ID, nil
		}
	}
	if baseURL == "" {
		return "", "", "", 0, fmt.Errorf("Evolution não configurada")
	}
	if instance == "" {
		return "", "", "", 0, fmt.Errorf("Evolution sem instance na config global")
	}
	return baseURL, apiKey, instance, 0, nil
}

func mergeEvolutionFromConfig(cfg models.AppConfig, acc *models.WAAccount) (baseURL, apiKey, instance string) {
	baseURL = cfg.WABaseURL.String
	apiKey = cfg.WAApiKey.String
	instance = cfg.WAInstance.String
	if acc != nil {
		if acc.BaseURL.Valid && acc.BaseURL.String != "" {
			baseURL = acc.BaseURL.String
		}
		if acc.APIKey.Valid && acc.APIKey.String != "" {
			apiKey = acc.APIKey.String
		}
		if acc.Instance.Valid && acc.Instance.String != "" {
			instance = acc.Instance.String
		}
	}
	return baseURL, apiKey, instance
}

// processTarget envia um target; retorna true só se marcou delivered (para rate limit por grupo).
func processTarget(ctx context.Context, st store.Store, t models.DispatchTarget, cfg models.AppConfig, waAccounts []models.WAAccount, rrCursor *int) bool {
	dispatch, err := st.GetDispatch(t.DispatchID)
	if err != nil {
		slog.Error("dispatch worker: dispatch não encontrado", "target_id", t.ID, "dispatch_id", t.DispatchID, "err", err)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "dispatch não encontrado")
		checkAllFinished(st, t.DispatchID)
		return false
	}

	group, err := st.GetRedesignGroup(t.GroupID)
	if err != nil {
		slog.Error("dispatch worker: grupo não encontrado", "target_id", t.ID, "group_id", t.GroupID, "err", err)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "grupo não encontrado")
		checkAllFinished(st, t.DispatchID)
		return false
	}
	if !group.JID.Valid || group.JID.String == "" {
		slog.Error("dispatch worker: grupo sem JID (WhatsApp)", "target_id", t.ID, "group_id", t.GroupID, "dispatch_id", t.DispatchID)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "grupo sem JID configurado")
		checkAllFinished(st, t.DispatchID)
		return false
	}

	baseURL, apiKey, instance, accountID, credErr := resolveEvolutionCredentials(st, cfg, waAccounts, t, group, rrCursor)
	if credErr != nil {
		slog.Error("dispatch worker: credenciais Evolution", "target_id", t.ID, "group_id", t.GroupID, "dispatch_id", t.DispatchID, "err", credErr)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", credErr.Error())
		checkAllFinished(st, t.DispatchID)
		return false
	}

	_ = st.UpdateDispatchTargetStatus(t.ID, "sending", "")
	_ = st.UpdateDispatchStatus(t.DispatchID, "sending")

	if accountID > 0 {
		if err := st.CheckAndIncrementWA(accountID); err != nil {
			slog.Error("dispatch worker: throttle conta WA", "account", accountID, "target_id", t.ID, "dispatch_id", t.DispatchID, "err", err)
			_ = st.UpdateDispatchTargetStatus(t.ID, "failed", fmt.Sprintf("throttle: %v", err))
			checkAllFinished(st, t.DispatchID)
			return false
		}
	}

	var msg struct {
		Text     string `json:"text"`
		MediaURL string `json:"media_url"`
	}
	if err := json.Unmarshal(dispatch.Message, &msg); err != nil {
		slog.Error("dispatch worker: payload message JSON inválido", "target_id", t.ID, "dispatch_id", t.DispatchID, "err", err)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "message JSON inválido")
		checkAllFinished(st, t.DispatchID)
		return false
	}
	text := msg.Text

	if strings.Contains(text, "{link}") {
		link := dispatch.AffiliateLink
		if link == "" {
			text = strings.TrimSpace(strings.ReplaceAll(text, "{link}", ""))
		} else {
			text = strings.ReplaceAll(text, "{link}", link)
		}
	}

	appDomain := ""
	if cfg.AppDomain.Valid {
		appDomain = cfg.AppDomain.String
	}
	text = sanitizeDispatchOutboundText(text, strings.TrimSpace(dispatch.AffiliateLink), appDomain)
	if strings.TrimSpace(text) == "" {
		slog.Error("dispatch worker: texto vazio após sanitização de URLs", "target_id", t.ID, "dispatch_id", t.DispatchID)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", "mensagem só continha URLs de marketplace (removidas por política)")
		checkAllFinished(st, t.DispatchID)
		return false
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
		slog.Error("dispatch worker: envio Evolution falhou", "target_id", t.ID, "dispatch_id", t.DispatchID, "group_jid", jid, "has_media", msg.MediaURL != "", "err", errMsg)
		_ = st.UpdateDispatchTargetStatus(t.ID, "failed", errMsg)
		checkAllFinished(st, t.DispatchID)
		return false
	}
	slog.Info("dispatch worker: sent", "target_id", t.ID, "group", jid)
	_ = st.UpdateDispatchTargetStatus(t.ID, "delivered", "")
	checkAllFinished(st, t.DispatchID)
	return true
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
		slog.Warn("dispatch worker: sendMedia rede/timeout, fallback texto", "jid", jid, "err", err)
		return sendEvolutionMessage(ctx, baseURL, apiKey, instance, jid, caption)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 400 {
		slog.Warn("dispatch worker: sendMedia HTTP erro, fallback texto", "status", resp.StatusCode, "jid", jid, "body", string(bodyBytes))
		return sendEvolutionMessage(ctx, baseURL, apiKey, instance, jid, caption)
	}
	if errTxt := evolutionSendBodyError(bodyBytes); errTxt != "" {
		slog.Warn("dispatch worker: sendMedia corpo JSON indica erro, fallback texto", "jid", jid, "evolution_err", errTxt, "body_snip", truncateLog(string(bodyBytes), 280))
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
		return fmt.Sprintf("sendText network: %v", err)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))

	if resp.StatusCode >= 400 {
		return fmt.Sprintf("evolution sendText status %d body=%s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}
	if errTxt := evolutionSendBodyError(bodyBytes); errTxt != "" {
		return fmt.Sprintf("evolution sendText corpo: %s (snip=%s)", errTxt, truncateLog(string(bodyBytes), 200))
	}
	return ""
}

func truncateLog(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func checkAllFinished(st store.Store, dispatchID int64) {
	done, err := st.AllDispatchTargetsFinished(dispatchID)
	if err != nil {
		slog.Warn("dispatch worker: AllDispatchTargetsFinished", "dispatch_id", dispatchID, "err", err)
		return
	}
	if !done {
		return
	}
	// Verificar se pelo menos 1 target foi entregue; senão marcar como failed
	hasDelivered, delivErr := st.HasDeliveredTarget(dispatchID)
	if delivErr != nil {
		slog.Warn("dispatch worker: HasDeliveredTarget", "dispatch_id", dispatchID, "err", delivErr)
	}
	finalStatus := "completed"
	if !hasDelivered {
		finalStatus = "failed"
		slog.Error("dispatch worker: dispatch sem nenhuma entrega bem-sucedida", "dispatch_id", dispatchID)
	} else {
		slog.Info("dispatch worker: dispatch completed", "dispatch_id", dispatchID)
	}
	_ = st.UpdateDispatchStatus(dispatchID, finalStatus)
}
