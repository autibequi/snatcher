// Package selection escolhe, de forma determinística, qual produto enfileirar para cada
// grupo ativo. Substitui o algo.tick (bandit) removido na W1.
//
// Fluxo (W4 refactor 2026-06): candidatos do catalog v2 → target.Match (filtro duro por
// categoria/preço/black-whitelist) → match.Score (ranqueia por qualidade/desconto) →
// dedup anti-repeat (group_sent_history) → enfileira no send_queue.
package selection

import (
	"context"
	"sort"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/sendwindow"
	"snatcher/backendv2/internal/services/target"
)

// Candidate é um produto do catálogo elegível para seleção.
type Candidate struct {
	CatalogID     int64
	CategoryID    int64
	Price         float64
	PriceOriginal float64
	Title         string
	QualityScore  float64
	DiscountPct   float64
	DedupKey      string
	Score         float64 // preenchido por Rank (match.Score)
}

// RankedCandidate é um Candidate após passar por Rank (target.Match + match.Score).
// É o que SelectCandidatesForGroup devolve — mesmo tipo usado pelo tick e pelo dry-run.
type RankedCandidate struct {
	Candidate
	TargetReason string // motivo do target.Match (ex: "ok", "categoria fora do alvo")
}

// GroupSelectionFlags reporta os gates de janela/pacing para um grupo.
// O tick usa esses flags para decidir se enfileira; o dry-run os expõe como diagnóstico
// sem filtrar candidatos (o usuário vê "passaria se na janela").
type GroupSelectionFlags struct {
	InWindow      bool // sendwindow.InSendWindow
	PacingOK      bool // sendwindow.ShouldEnqueueGroup
	HasChannel    bool // grupo tem channel_id válido e canal active
	HasModem      bool // group_admins com conta primary/backup
	NoChannelReason string // motivo quando HasChannel=false
}

// SelectCandidatesForGroup é a função canônica de seleção para um grupo:
// carrega o canal, o target config e os candidatos (loadCandidates), executa Rank
// (target.Match + match.Score) e devolve os candidatos rankeados + flags de
// janela/pacing. Função pura de dados — não enfileira, não muta estado.
//
// Tanto o tick (selectAndEnqueueForGroup) quanto o dry-run usam esta função,
// garantindo que ambos reflitam exatamente a mesma lógica de seleção.
func SelectCandidatesForGroup(ctx context.Context, db *sqlx.DB, groupID, channelID int64, dailyCap int) ([]RankedCandidate, GroupSelectionFlags, error) {
	flags := GroupSelectionFlags{}

	flags.InWindow = sendwindow.InSendWindow(ctx, db)
	flags.PacingOK = sendwindow.ShouldEnqueueGroup(ctx, db, groupID, dailyCap)

	if channelID == 0 {
		flags.NoChannelReason = "grupo sem channel_id"
		return nil, flags, nil
	}

	var ch models.ChannelV2
	if err := db.GetContext(ctx, &ch, `
		SELECT id, name, quality_threshold, daily_cap, active, created_at,
		       price_min, price_max, min_discount_pct
		FROM channels_v2 WHERE id = $1`, channelID); err != nil {
		return nil, flags, err
	}
	if !ch.Active {
		flags.NoChannelReason = "canal inativo"
		return nil, flags, nil
	}
	flags.HasChannel = true

	var modemCount int
	if err := db.GetContext(ctx, &modemCount, `
		SELECT COUNT(*) FROM group_admins ga
		JOIN accounts a ON a.id = ga.account_id
		WHERE ga.group_id = $1 AND a.status IN ('primary', 'backup')`, groupID); err != nil {
		return nil, flags, err
	}
	flags.HasModem = modemCount > 0

	tcfg, err := loadTargetConfig(ctx, db, channelID)
	if err != nil {
		return nil, flags, err
	}

	cands, err := loadCandidates(ctx, db, groupID, ch.QualityThreshold)
	if err != nil {
		return nil, flags, err
	}

	ranked := rankWithReasons(cands, tcfg, ch)
	return ranked, flags, nil
}

// rankWithReasons é igual a Rank mas devolve RankedCandidate (com TargetReason).
// Usada por SelectCandidatesForGroup para manter compatibilidade de tipo.
func rankWithReasons(cands []Candidate, tcfg target.Config, ch models.ChannelV2) []RankedCandidate {
	out := make([]RankedCandidate, 0, len(cands))
	for _, c := range cands {
		ok, reason := target.Match(target.Product{CategoryID: c.CategoryID, Price: c.Price, Title: c.Title}, tcfg)
		if !ok {
			continue
		}
		catID := c.CategoryID
		res := match.Score(match.CatalogItem{
			ID:            c.CatalogID,
			CategoryID:    &catID,
			QualityScore:  c.QualityScore,
			DiscountPct:   c.DiscountPct,
			PriceCurrent:  c.Price,
			PriceOriginal: c.PriceOriginal,
		}, ch)
		if res.Score <= 0 {
			continue
		}
		c.Score = res.Score
		out = append(out, RankedCandidate{Candidate: c, TargetReason: reason})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

// Rank filtra os candidatos pelo público-alvo (target.Match) e ordena por score
// decrescente (match.Score). Função pura, sem I/O — o coração testável da seleção.
func Rank(cands []Candidate, tcfg target.Config, ch models.ChannelV2) []Candidate {
	out := make([]Candidate, 0, len(cands))
	for _, c := range cands {
		if ok, _ := target.Match(target.Product{CategoryID: c.CategoryID, Price: c.Price, Title: c.Title}, tcfg); !ok {
			continue
		}
		catID := c.CategoryID
		res := match.Score(match.CatalogItem{
			ID:            c.CatalogID,
			CategoryID:    &catID,
			QualityScore:  c.QualityScore,
			DiscountPct:   c.DiscountPct,
			PriceCurrent:  c.Price,
			PriceOriginal: c.PriceOriginal,
		}, ch)
		if res.Score <= 0 {
			continue
		}
		c.Score = res.Score
		out = append(out, c)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}
