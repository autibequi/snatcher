// Package notifier envia resumos operacionais (relatórios Jonfrey, entregas
// de dispatch, erros relevantes) para um grupo WhatsApp configurado em
// Settings → Notificações (appconfig.notifications_group_id).
//
// Princípios:
//   - Best-effort. Falha de notificação NUNCA quebra o fluxo principal — só
//     emite slog.Warn. Os hooks chamam Notify async (goroutine) para não
//     atrasar o caminho-crítico (worker, request HTTP).
//   - Dedup por chave (kind+hash) com TTL curto pra evitar spam quando o
//     mesmo evento dispara em rajada (ex.: 50 dispatches completados em 30s
//     virariam 50 mensagens — vira 1 resumo por janela).
//   - Sem grupo configurado → no-op silencioso (não polui logs).
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
	"snatcher/backendv2/internal/store"
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
		slog.Warn("notifier: grupo sem JID — pulando", "kind", kind, "group_id", group.ID, "name", group.Name)
		return
	}
	if group.Platform != "whatsapp" {
		// Telegram pode entrar depois — por ora só WA.
		slog.Debug("notifier: grupo não é WA, pulando", "kind", kind, "platform", group.Platform)
		return
	}

	// Resolve credenciais Evolution: account preferida do grupo, senão
	// config global. Usa o mesmo padrão do dispatch_worker mas em forma
	// reduzida — não precisamos de round-robin para notificações.
	baseURL, apiKey, instance := resolveCreds(n.st, cfg, group)
	if baseURL == "" || instance == "" {
		slog.Warn("notifier: Evolution sem URL/instance", "kind", kind)
		return
	}

	// Prefixo curto pra distinguir notificação de produto real no grupo.
	body := fmt.Sprintf("🤖 *%s*\n%s", labelFor(kind), text)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := postEvolutionText(ctx, baseURL, apiKey, instance, group.JID.String, body); err != nil {
		slog.Warn("notifier: envio falhou", "kind", kind, "group_jid", group.JID.String, "err", err)
		return
	}
	slog.Info("notifier: enviado", "kind", kind, "group", group.Name)
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
