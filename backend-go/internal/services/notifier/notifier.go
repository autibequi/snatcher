// Package notifier envia alertas operacionais (Jonfrey, sugestões LLM, falhas
// de loop, conta em quarentena) para um grupo WhatsApp (Evolution) ou Telegram
// (TG_BOT_TOKEN + chat_id em groups.jid), conforme Settings → Notificações.
//
// Princípios:
//   - Best-effort. Falha de notificação NUNCA quebra o fluxo principal — só
//     emite slog.Warn. Os hooks chamam Notify async (goroutine) para não
//     atrasar o caminho-crítico (worker, request HTTP).
//   - Dedup por chave (kind+hash) com TTL curto pra evitar spam quando o
//     mesmo evento dispara em rajada.
//   - Sem grupo configurado → no-op silencioso (não polui logs).
//   - Disparos de fila (send_queue) não geram notificação aqui — só estado
//     de conta/loops/sugestões/Jonfrey.
package notifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/adapters"
	store "snatcher/backendv2/internal/repositories"
)

// Kind classifica o evento. Usado pra dedup e log estruturado.
type Kind string

const (
	KindJonfreyReview      Kind = "jonfrey-review"
	KindJonfreyRecommend   Kind = "jonfrey-recommendation"
	KindAutoMatchSummary   Kind = "auto-match-summary"
	KindDispatchCompleted  Kind = "dispatch-completed"
	KindDispatchFailed     Kind = "dispatch-failed"
	KindAccountIssue       Kind = "account-issue"
	KindLLMSuggestion      Kind = "llm-suggestion"
	KindLoopFailure        Kind = "loop-failure"
	KindGenericInfo        Kind = "info"
)

// Notifier é a fachada usada pelos hooks. Implementações reais vivem aqui;
// um nil-Notifier (zero value) é seguro: todos os métodos viram no-op.
type Notifier struct {
	st store.Store

	mu       sync.Mutex
	lastSent map[string]time.Time
}

// New cria o notifier. st pode ser nil — nesse caso vira no-op total
// (útil em testes que não envolvem o ciclo completo).
func New(st store.Store) *Notifier {
	return &Notifier{
		st:       st,
		lastSent: make(map[string]time.Time),
	}
}

// Notify envia mensagem em background. Sempre retorna imediatamente.
//
// dedupKey: se não-vazio, suprime mensagens repetidas dentro de dedupTTL.
// Use uma string estável que represente o "evento lógico" (ex.: "dispatch:42",
// "jonfrey-review:24h") — múltiplas chamadas com mesma key dentro do TTL
// resultam em uma única notificação efetiva.
func (n *Notifier) Notify(kind Kind, text string, dedupKey string, dedupTTL time.Duration) {
	if n == nil || n.st == nil {
		return
	}
	if strings.TrimSpace(text) == "" {
		return
	}

	if dedupKey != "" && dedupTTL > 0 {
		n.mu.Lock()
		last, ok := n.lastSent[dedupKey]
		if ok && time.Since(last) < dedupTTL {
			n.mu.Unlock()
			slog.Debug("notifier: dedup hit, skip", "kind", kind, "key", dedupKey)
			return
		}
		n.lastSent[dedupKey] = time.Now()
		// GC simples — quando o map crescer demais, reseta entradas velhas.
		if len(n.lastSent) > 256 {
			cutoff := time.Now().Add(-24 * time.Hour)
			for k, t := range n.lastSent {
				if t.Before(cutoff) {
					delete(n.lastSent, k)
				}
			}
		}
		n.mu.Unlock()
	}

	go n.send(kind, text)
}

// send é a rotina interna — busca config + grupo + credenciais Evolution
// e dispara. Erros viram slog.Warn (fluxo principal não tem como reagir).
func (n *Notifier) send(kind Kind, text string) {
	cfg, err := n.st.GetConfig()
	if err != nil {
		slog.Warn("notifier: GetConfig falhou", "kind", kind, "err", err)
		return
	}
	if !cfg.NotificationsGroupID.Valid || cfg.NotificationsGroupID.Int64 <= 0 {
		// Sem grupo configurado — silêncio. É o caso default em instalações
		// novas; não logar pra não poluir.
		return
	}

	group, err := n.st.GetRedesignGroup(cfg.NotificationsGroupID.Int64)
	if err != nil {
		slog.Warn("notifier: grupo de notificação não encontrado", "kind", kind, "group_id", cfg.NotificationsGroupID.Int64, "err", err)
		return
	}
	if !group.JID.Valid || strings.TrimSpace(group.JID.String) == "" {
		slog.Warn("notifier: grupo sem JID/chat_id — pulando", "kind", kind, "group_id", group.ID, "name", group.Name)
		return
	}

	jid := strings.TrimSpace(group.JID.String)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	switch group.Platform {
	case "telegram":
		tg := adapters.NewTelegramAdapter()
		if !tg.Configured() {
			slog.Warn("notifier: grupo Telegram mas TG_BOT_TOKEN não configurado no ambiente", "kind", kind, "group", group.Name)
			return
		}
		body := fmt.Sprintf("🤖 %s\n%s", labelFor(kind), text)
		if err := tg.SendPlainText(ctx, jid, body); err != nil {
			slog.Warn("notifier: envio Telegram falhou", "kind", kind, "chat_id", jid, "err", err)
			return
		}
		slog.Info("notifier: enviado", "kind", kind, "group", group.Name, "platform", "telegram")
	case "whatsapp":
		baseURL, apiKey, instance := resolveCreds(n.st, cfg, group)
		if baseURL == "" || instance == "" {
			slog.Warn("notifier: Evolution sem URL/instance", "kind", kind)
			return
		}
		body := fmt.Sprintf("🤖 *%s*\n%s", labelFor(kind), text)
		if err := postEvolutionText(ctx, baseURL, apiKey, instance, jid, body); err != nil {
			slog.Warn("notifier: envio WA falhou", "kind", kind, "group_jid", jid, "err", err)
			return
		}
		slog.Info("notifier: enviado", "kind", kind, "group", group.Name, "platform", "whatsapp")
	default:
		slog.Warn("notifier: plataforma de grupo não suportada para alertas", "kind", kind, "platform", group.Platform)
	}
}

// resolveCreds retorna credenciais Evolution do appconfig global.
// F08b: per-account overrides (waaccount.base_url/api_key/instance) removidos.
func resolveCreds(_ store.Store, cfg models.AppConfig, _ models.RedesignGroup) (baseURL, apiKey, instance string) {
	baseURL = cfg.WABaseURL.String
	apiKey = cfg.WAApiKey.String
	instance = cfg.WAInstance.String
	return
}

func labelFor(k Kind) string {
	switch k {
	case KindJonfreyReview:
		return "Jonfrey · Revisão"
	case KindJonfreyRecommend:
		return "Jonfrey · Recomendação"
	case KindAutoMatchSummary:
		return "Auto-match"
	case KindDispatchCompleted:
		return "Dispatch entregue"
	case KindDispatchFailed:
		return "Dispatch falhou"
	case KindAccountIssue:
		return "Conta WA"
	case KindLLMSuggestion:
		return "Sugestão LLM"
	case KindLoopFailure:
		return "Loop LLM"
	default:
		return "Snatcher"
	}
}

func postEvolutionText(ctx context.Context, baseURL, apiKey, instance, jid, text string) error {
	url := strings.TrimRight(baseURL, "/") + "/message/sendText/" + instance
	payload, _ := json.Marshal(map[string]any{
		"number": jid,
		"text":   text,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", apiKey)

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 400 {
		return fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}
