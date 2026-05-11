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
)

// ReviewDispatches POST /api/jonfrey/review-dispatches
// Body: { "period_hours": 24 }
// Resposta: { headline, items[], generated_at }
func (h *JonfreyHandler) ReviewDispatches(w http.ResponseWriter, r *http.Request) {
	var req reviewDispatchesReq
	_ = json.NewDecoder(r.Body).Decode(&req)
	period := req.PeriodHours
	if period < reviewDispatchesMinHours {
		period = 24
	}
	if period > reviewDispatchesMaxHours {
		period = reviewDispatchesMaxHours
	}

	ctx, cancel := context.WithTimeout(r.Context(), reviewDispatchesHTTPTimeout)
	defer cancel()

	rows, err := h.fetchReviewDispatchRows(ctx, period)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, fmt.Sprintf("falha ao listar dispatches: %v", err))
		return
	}

	if len(rows) == 0 {
		writeJSON(w, http.StatusOK, reviewDispatchesResp{
			Headline:    fmt.Sprintf("Nenhum dispatch nas últimas %dh.", period),
			Items:       []reviewDispatchItem{},
			GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		})
		return
	}

	// LLM opcional — sem ele, devolve resultado heurístico (sinaliza dispatches sem grupo/produto).
	cli := h.getLLMClient()
	if cli == nil {
		resp := heuristicReviewDispatches(rows, period)
		writeJSON(w, http.StatusOK, resp)
		return
	}

	resp, err := llmReviewDispatches(ctx, cli, rows, period)
	if err != nil {
		slog.Warn("review-dispatches LLM falhou — caindo para heurística", "err", err, "rows", len(rows))
		resp = heuristicReviewDispatches(rows, period)
		resp.Headline = "Análise heurística (LLM indisponível): " + resp.Headline
	}
	writeJSON(w, http.StatusOK, resp)
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

	prompt := fmt.Sprintf(`Você é o Jonfrey: revisor de dispatches de promoções.

Analisa cada dispatch abaixo e avalia se o PRODUTO bate com o GRUPO/CANAL de destino.
Sinais úteis: nome do canal indica nicho (ex.: "Tech BR" deve receber eletrônicos; "Cozinha" deve receber utensílios). Tags/marca do produto reforçam a categoria. score=match heurístico (0-100).

Critérios de avaliação:
- "ok"            : produto coerente com o canal.
- "problema"      : indicação fraca/duvidosa (canal vago, score baixo, tags pobres).
- "produto_errado": produto claramente fora do nicho do canal.
- "pendente"      : sem grupo OU sem produto (composição manual ou dispatch incompleto) — não dá pra avaliar.

%d dispatches últimas %dh (JSON):
%s

Retorne JSON estrito:
{
  "headline": "frase curta resumindo a saúde dos disparos do período",
  "items": [
    {"dispatch_id":123,"short_id":"abc","group":"...","product":"...","assessment":"ok|problema|produto_errado|pendente","note":"até 80 chars"}
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
		note := truncateRune(strings.TrimSpace(it.Note), 240)
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
