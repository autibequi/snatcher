package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/notifier"
)

// ── POST /api/jonfrey/review-dispatches ──────────────────────────────────────
//
// Avalia se os dispatches do período foram para o grupo correto e contêm o produto certo.
// Diferente das ações registradas em actionRegistry, este endpoint roda síncrono (LLM inline)
// e devolve a avaliação direto pro front — não cria audit row em jonfrey_actions.

type reviewDispatchesReq struct {
	PeriodHours int `json:"period_hours"`
}

type reviewDispatchItem struct {
	DispatchID int64  `json:"dispatch_id"`
	ShortID    string `json:"short_id"`
	Group      string `json:"group"`
	Product    string `json:"product"`
	Assessment string `json:"assessment"` // ok | problema | produto_errado | pendente
	Note       string `json:"note"`
}

type reviewDispatchesResp struct {
	Headline    string               `json:"headline"`
	Items       []reviewDispatchItem `json:"items"`
	GeneratedAt string               `json:"generated_at"`
	// Segundos restantes até o cache expirar (mesmo padrão do /dashboard/recommendation).
	// 0 quando vier sem cache (ex.: heurística sem LLM ou regeneração forçada).
	CachedFor int `json:"cached_for_seconds,omitempty"`
}

// reviewDispatchRow espelha o JOIN dispatches × auto_match_logs × channel × catalogproduct.
type reviewDispatchRow struct {
	DispatchID  int64    `db:"dispatch_id"`
	ShortID     string   `db:"short_id"`
	Status      string   `db:"status"`
	ComposedBy  string   `db:"composed_by"`
	ChannelName *string  `db:"channel_name"`
	ProductName *string  `db:"product_name"`
	Brand       *string  `db:"brand"`
	Source      *string  `db:"source"`
	Categories  *string  `db:"categories"`
	Score       *float64 `db:"score"`
	CreatedAt   string   `db:"created_at"`
}

const (
	reviewDispatchesMaxSample   = 30
	reviewDispatchesMinHours    = 1
	reviewDispatchesMaxHours    = 168 // 7 dias
	reviewDispatchesLLMTimeout  = 90 * time.Second
	reviewDispatchesHTTPTimeout = 120 * time.Second
	reviewDispatchesCacheTTL    = 1 * time.Hour
)

// ReviewDispatches POST /api/jonfrey/review-dispatches
// Body: { "period_hours": 24 }
// Resposta: { headline, items[], generated_at }
//
// Mantido por compat. Caminho preferido é o GET (auto-load + cache).
func (h *JonfreyHandler) ReviewDispatches(w http.ResponseWriter, r *http.Request) {
	var req reviewDispatchesReq
	_ = json.NewDecoder(r.Body).Decode(&req)
	period := normalizeReviewPeriod(req.PeriodHours)

	ctx, cancel := context.WithTimeout(r.Context(), reviewDispatchesHTTPTimeout)
	defer cancel()

	resp, err := h.computeReviewDispatches(ctx, period)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// ReviewDispatchesGet GET /api/jonfrey/review-dispatches?force=1
// Mesmo padrão do /api/dashboard/recommendation: TTL 1h em memória,
// força regeneração via ?force=1. Período fixo 24h (use POST se quiser outro).
func (h *JonfreyHandler) ReviewDispatchesGet(w http.ResponseWriter, r *http.Request) {
	force := r.URL.Query().Get("force") == "1"

	if !force {
		h.reviewMu.Lock()
		cached := h.reviewCache
		cachedAt := h.reviewCachedAt
		h.reviewMu.Unlock()

		if cached != nil && time.Since(cachedAt) < reviewDispatchesCacheTTL {
			out := *cached
			out.CachedFor = int(reviewDispatchesCacheTTL.Seconds() - time.Since(cachedAt).Seconds())
			writeJSON(w, http.StatusOK, out)
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), reviewDispatchesHTTPTimeout)
	defer cancel()

	resp, err := h.computeReviewDispatches(ctx, 24)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	now := time.Now()
	resp.CachedFor = int(reviewDispatchesCacheTTL.Seconds())

	h.reviewMu.Lock()
	cp := resp
	h.reviewCache = &cp
	h.reviewCachedAt = now
	h.reviewMu.Unlock()

	// Cache miss / regeneração → notifica grupo configurado em Settings.
	// Dedup curto (10min) cobre F5 sequencial; dedup chave inclui `force`
	// para que toggle manual de "↻" sempre passe pelo menos 1 envio por TTL.
	h.notifyJonfreyReview(resp, force)

	writeJSON(w, http.StatusOK, resp)
}

// notifyJonfreyReview posta no grupo de notificações um resumo da revisão.
// Lista veredictos críticos (produto_errado / problema), até 6 itens.
func (h *JonfreyHandler) notifyJonfreyReview(resp reviewDispatchesResp, forced bool) {
	if h.notif == nil {
		return
	}
	var problems []reviewDispatchItem
	for _, it := range resp.Items {
		if it.Assessment == "produto_errado" || it.Assessment == "problema" {
			problems = append(problems, it)
		}
	}
	lines := []string{resp.Headline}
	if len(problems) == 0 {
		lines = append(lines, fmt.Sprintf("✅ Sem anomalias em %d disparos avaliados.", len(resp.Items)))
	} else {
		lines = append(lines, fmt.Sprintf("⚠ %d anomalia%s (de %d):",
			len(problems), pluralPT(len(problems)), len(resp.Items)))
		const maxItems = 6
		for i, it := range problems {
			if i >= maxItems {
				lines = append(lines, fmt.Sprintf("…e mais %d", len(problems)-maxItems))
				break
			}
			tag := "⚠"
			if it.Assessment == "produto_errado" {
				tag = "❌"
			}
			lines = append(lines, fmt.Sprintf("%s %s | %s — %s",
				tag, truncShortS(it.Group, 24), truncShortS(it.Product, 36), truncShortS(it.Note, 80)))
		}
	}
	dedupKey := "jonfrey-review:24h"
	if forced {
		dedupKey += ":force"
	}
	h.notif.Notify(notifier.KindJonfreyReview, strings.Join(lines, "\n"),
		dedupKey, 10*time.Minute)
}

// pluralPT — sufixo plural simples (mesmo helper do scheduler, redeclarado
// pra evitar import cíclico).
func pluralPT(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func truncShortS(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

// computeReviewDispatches roda a query + LLM (com fallback heurístico).
// Não toca cache — quem mexe no cache é o caller (GET). POST nunca cacheia.
func (h *JonfreyHandler) computeReviewDispatches(ctx context.Context, period int) (reviewDispatchesResp, error) {
	rows, err := h.fetchReviewDispatchRows(ctx, period)
	if err != nil {
		return reviewDispatchesResp{}, fmt.Errorf("falha ao listar dispatches: %w", err)
	}

	if len(rows) == 0 {
		return reviewDispatchesResp{
			Headline:    fmt.Sprintf("Nenhum disparo nas últimas %dh — auto-disparo provavelmente está em pausa ou fila vazia.", period),
			Items:       []reviewDispatchItem{},
			GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		}, nil
	}

	cli := h.getLLMClient()
	if cli == nil {
		return heuristicReviewDispatches(rows, period), nil
	}

	resp, err := llmReviewDispatches(ctx, cli, rows, period)
	if err != nil {
		slog.Warn("review-dispatches LLM falhou — caindo para heurística", "err", err, "rows", len(rows))
		resp = heuristicReviewDispatches(rows, period)
		resp.Headline = "Análise heurística (LLM indisponível): " + resp.Headline
	}
	return resp, nil
}

func normalizeReviewPeriod(period int) int {
	if period < reviewDispatchesMinHours {
		return 24
	}
	if period > reviewDispatchesMaxHours {
		return reviewDispatchesMaxHours
	}
	return period
}

func (h *JonfreyHandler) getLLMClient() llm.Client {
	if h == nil || h.llmFn == nil {
		return nil
	}
	return h.llmFn()
}

func (h *JonfreyHandler) fetchReviewDispatchRows(ctx context.Context, periodHours int) ([]reviewDispatchRow, error) {
	// Query enriquece dispatches com canal+produto via auto_match_logs.
	// LEFT JOIN: composes manuais (sem auto_match_log) também aparecem com group/product=NULL.
	// `tags` em catalogproduct é jsonb — convertemos para CSV truncado pra reduzir tokens.
	const q = `
		SELECT d.id              AS dispatch_id,
		       d.short_id        AS short_id,
		       d.status          AS status,
		       d.composed_by     AS composed_by,
		       ch.name           AS channel_name,
		       cp.canonical_name AS product_name,
		       cp.brand          AS brand,
		       cp.lowest_price_source AS source,
		       LEFT(
		           COALESCE(
		               (SELECT string_agg(t, ',') FROM jsonb_array_elements_text(cp.tags) AS t),
		               ''
		           ),
		           120
		       )                 AS categories,
		       aml.score         AS score,
		       to_char(d.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS created_at
		FROM dispatches d
		LEFT JOIN auto_match_logs aml ON aml.dispatch_id = d.id
		LEFT JOIN channel ch ON ch.id = aml.channel_id
		LEFT JOIN catalogproduct cp ON cp.id = aml.product_id
		WHERE d.created_at > now() - ($1 || ' hours')::interval
		ORDER BY d.created_at DESC
		LIMIT 200`

	var rows []reviewDispatchRow
	if err := h.db.SelectContext(ctx, &rows, q, fmt.Sprintf("%d", periodHours)); err != nil {
		return nil, err
	}
	return rows, nil
}

// heuristicReviewDispatches gera uma avaliação determinística sem LLM.
// Regras simples — só pra que o front tenha algo útil quando o LLM estiver fora.
func heuristicReviewDispatches(rows []reviewDispatchRow, period int) reviewDispatchesResp {
	items := make([]reviewDispatchItem, 0, len(rows))
	suspect := 0
	for _, r := range rows {
		group := strDeref(r.ChannelName)
		product := strDeref(r.ProductName)
		assessment := "ok"
		note := ""

		switch {
		case r.Status == "failed":
			assessment = "problema"
			note = "dispatch falhou — verificar entrega"
			suspect++
		case group == "" && product == "":
			assessment = "pendente"
			note = "sem grupo/produto associado (composição manual)"
		case group == "" && product != "":
			assessment = "problema"
			note = "produto sem canal de destino"
			suspect++
		case product == "" && group != "":
			assessment = "problema"
			note = "canal sem produto associado"
			suspect++
		}

		items = append(items, reviewDispatchItem{
			DispatchID: r.DispatchID,
			ShortID:    r.ShortID,
			Group:      group,
			Product:    product,
			Assessment: assessment,
			Note:       note,
		})
	}

	headline := fmt.Sprintf("Heurística: %d disparos nas últimas %dh, %d com sinal de problema.", len(rows), period, suspect)
	return reviewDispatchesResp{
		Headline:    headline,
		Items:       items,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
}

// llmReviewDispatches faz uma única chamada LLM com amostra dos dispatches e devolve avaliação.
func llmReviewDispatches(ctx context.Context, cli llm.Client, rows []reviewDispatchRow, period int) (reviewDispatchesResp, error) {
	// Cap pra controlar tokens — pega os mais recentes (rows já vem DESC).
	sample := rows
	if len(sample) > reviewDispatchesMaxSample {
		sample = sample[:reviewDispatchesMaxSample]
	}

	type promptItem struct {
		ID       int64   `json:"id"`
		Short    string  `json:"short"`
		Group    string  `json:"group"`
		Product  string  `json:"product"`
		Brand    string  `json:"brand"`
		Source   string  `json:"source"`
		Tags     string  `json:"tags"`
		Status   string  `json:"status"`
		Score    float64 `json:"score"`
		Composer string  `json:"composer"`
	}
	pi := make([]promptItem, 0, len(sample))
	for _, r := range sample {
		pi = append(pi, promptItem{
			ID:       r.DispatchID,
			Short:    r.ShortID,
			Group:    strDeref(r.ChannelName),
			Product:  strDeref(r.ProductName),
			Brand:    strDeref(r.Brand),
			Source:   strDeref(r.Source),
			Tags:     strDeref(r.Categories),
			Status:   r.Status,
			Score:    floatDeref(r.Score),
			Composer: r.ComposedBy,
		})
	}

	payloadJSON, err := json.Marshal(pi)
	if err != nil {
		return reviewDispatchesResp{}, fmt.Errorf("marshal sample: %w", err)
	}

	prompt := fmt.Sprintf(`Você é o Jonfrey: auditor do AUTO-DISPARO de promoções.

Para cada dispatch abaixo decida se o AUTO-MATCH escolheu o grupo certo para o produto.
A questão central é semântica: o nicho aparente do GRUPO (pelo nome) bate com o nicho do PRODUTO (pelo nome + marca + tags)?

Heurísticas:
- Nome do grupo costuma indicar tema (ex.: "Tech BR" → eletrônicos; "Cozinha Pro" → utensílios; "Beleza & Cia" → cosméticos).
- Marca + tags reforçam a categoria. Score (0-100) é o match heurístico já calculado pelo sistema.
- Composições manuais (composer ≠ "auto") merecem benefício da dúvida — não são culpa do auto-match.

Avaliação por item:
- "ok"             : produto bate o nicho do grupo (mesmo que score moderado, se o tema casa).
- "problema"       : casamento fraco/duvidoso — grupo de tema vago, tags pobres, marca neutra OU score muito baixo.
- "produto_errado" : claramente fora do nicho — ex.: produto de cozinha enviado em grupo de games; cosmético em grupo de eletrônicos.
- "pendente"       : impossível avaliar — falta grupo OU produto na linha (composição manual sem auto_match_log, ou dispatch incompleto).

Em cada NOTE (≤120 chars) cite o nome do produto e do grupo de forma curta e diga POR QUÊ ("Furadeira em grupo de moda → fora do nicho", "Notebook em Tech BR → bate", etc).

%d dispatches últimas %dh (JSON):
%s

Retorne JSON estrito:
{
  "headline": "1 frase curta sobre a saúde do auto-disparo no período (quantos bateram, quantos parecem fora)",
  "items": [
    {"dispatch_id":123,"short_id":"abc","group":"...","product":"...","assessment":"ok|problema|produto_errado|pendente","note":"até 120 chars citando os nomes"}
  ]
}
Inclua TODOS os %d dispatches no array items, sem cortar.`,
		len(pi), period, string(payloadJSON), len(pi))

	llmCtx, cancel := context.WithTimeout(ctx, reviewDispatchesLLMTimeout)
	defer cancel()

	raw, err := cli.Complete(llmCtx, prompt, llm.Options{
		MaxTokens:   8192,
		Temperature: 0.15,
		Operation:   "jonfrey_review_dispatches",
		JSONMode:    true,
	})
	if err != nil {
		return reviewDispatchesResp{}, fmt.Errorf("LLM: %w", err)
	}

	var parsed struct {
		Headline string               `json:"headline"`
		Items    []reviewDispatchItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return reviewDispatchesResp{}, fmt.Errorf("parse LLM JSON: %w", err)
	}

	resp := reviewDispatchesResp{
		Headline:    strings.TrimSpace(parsed.Headline),
		Items:       sanitizeReviewItems(parsed.Items, sample),
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if resp.Headline == "" {
		resp.Headline = fmt.Sprintf("Análise Jonfrey de %d dispatches nas últimas %dh.", len(sample), period)
	}
	return resp, nil
}

// sanitizeReviewItems garante:
//   - somente IDs presentes no sample (LLM não pode inventar dispatch_id);
//   - assessment dentro do enum esperado pelo front;
//   - note com tamanho limitado;
//   - cada dispatch do sample retornado pelo menos uma vez (preenche faltantes com "pendente").
func sanitizeReviewItems(items []reviewDispatchItem, sample []reviewDispatchRow) []reviewDispatchItem {
	allowedAssess := map[string]bool{"ok": true, "problema": true, "produto_errado": true, "pendente": true}
	bySampleID := make(map[int64]reviewDispatchRow, len(sample))
	for _, r := range sample {
		bySampleID[r.DispatchID] = r
	}

	seen := make(map[int64]bool, len(sample))
	out := make([]reviewDispatchItem, 0, len(sample))
	for _, it := range items {
		row, ok := bySampleID[it.DispatchID]
		if !ok {
			continue
		}
		if seen[it.DispatchID] {
			continue
		}
		seen[it.DispatchID] = true
		assess := strings.ToLower(strings.TrimSpace(it.Assessment))
		if !allowedAssess[assess] {
			assess = "pendente"
		}
		group := strings.TrimSpace(it.Group)
		if group == "" {
			group = strDeref(row.ChannelName)
		}
		product := strings.TrimSpace(it.Product)
		if product == "" {
			product = strDeref(row.ProductName)
		}
		note := truncateRune(strings.TrimSpace(it.Note), 200)
		out = append(out, reviewDispatchItem{
			DispatchID: it.DispatchID,
			ShortID:    row.ShortID,
			Group:      group,
			Product:    product,
			Assessment: assess,
			Note:       note,
		})
	}

	for _, r := range sample {
		if seen[r.DispatchID] {
			continue
		}
		out = append(out, reviewDispatchItem{
			DispatchID: r.DispatchID,
			ShortID:    r.ShortID,
			Group:      strDeref(r.ChannelName),
			Product:    strDeref(r.ProductName),
			Assessment: "pendente",
			Note:       "Não avaliado pelo LLM (truncado ou omitido).",
		})
	}
	return out
}

func strDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func floatDeref(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func truncateRune(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}
