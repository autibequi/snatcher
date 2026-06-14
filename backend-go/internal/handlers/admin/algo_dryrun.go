package admin

import (
	"net/http"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/selection"
)

// GET /api/admin/algo/dry-run
// Simula um tick do Score Engine sem enviar nada.
// Para cada grupo ativo, usa SelectCandidatesForGroup — a mesma função canônica do
// tick — e devolve os candidatos rankeados + flags de janela/pacing.
// Isso garante que would_enqueue reflita exatamente o que o tick faria.
func AlgoDryRunHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		type candidateInfo struct {
			CatalogID    int64   `json:"catalog_id"`
			Title        string  `json:"title"`
			Score        float64 `json:"score"`
			QualityScore float64 `json:"quality_score"`
			DiscountPct  float64 `json:"discount_pct"`
			Price        float64 `json:"price"`
		}

		type groupResult struct {
			GroupID     int64   `json:"group_id"`
			GroupName   string  `json:"group_name"`
			ChannelName *string `json:"channel_name,omitempty"`
			// Estado resumido
			Blocked bool   `json:"blocked"`
			Reason  string `json:"reason"` // motivo do bloqueio ou "ok — enfileiraria"
			// Detalhes
			DailyMsgCap     int  `json:"daily_msg_cap"`
			SentToday       int  `json:"sent_today"`
			CandidatesFound int  `json:"candidates_found"` // após target.Match + match.Score
			HasModem        bool `json:"has_modem"`
			// Flags de janela/pacing (não filtram — o dry-run reporta mesmo quando bloqueado)
			InWindow bool `json:"in_window"`  // janela de envio ativa agora
			PacingOK bool `json:"pacing_ok"`  // pacing gap respeitado
			// Top candidato (se houver)
			TopCandidate *candidateInfo `json:"top_candidate,omitempty"`
		}

		// Grupos ativos
		type groupRow struct {
			ID          int64   `db:"id"`
			Name        string  `db:"name"`
			ChannelID   *int64  `db:"channel_id"`
			ChannelName *string `db:"channel_name"`
			DailyMsgCap int     `db:"daily_msg_cap"`
		}
		var groups []groupRow
		_ = db.SelectContext(ctx, &groups, `
			SELECT g.id, COALESCE(g.name, g.jid, g.id::text) AS name,
			       g.channel_id, ch.name AS channel_name,
			       COALESCE(g.daily_msg_cap, 0) AS daily_msg_cap
			FROM groups g
			LEFT JOIN channels_v2 ch ON ch.id = g.channel_id
			WHERE COALESCE(g.status, 'active') = 'active'
			ORDER BY g.id
			LIMIT 50
		`)

		results := make([]groupResult, 0, len(groups))
		for _, g := range groups {
			res := groupResult{
				GroupID:     g.ID,
				GroupName:   g.Name,
				ChannelName: g.ChannelName,
				DailyMsgCap: g.DailyMsgCap,
			}

			if g.DailyMsgCap <= 0 {
				res.Blocked = true
				res.Reason = "daily_msg_cap = 0 — grupo sem cap configurado"
				results = append(results, res)
				continue
			}

			var sentToday int
			_ = db.QueryRowContext(ctx, `
				SELECT COUNT(*) FROM send_log
				WHERE group_id=$1 AND sent_at::date=CURRENT_DATE AND status='sent'
			`, g.ID).Scan(&sentToday)
			res.SentToday = sentToday

			channelID := int64(0)
			if g.ChannelID != nil {
				channelID = *g.ChannelID
			}

			// Usa a função canônica — mesma lógica do tick.
			ranked, flags, err := selection.SelectCandidatesForGroup(ctx, db, g.ID, channelID, g.DailyMsgCap)
			if err != nil {
				res.Blocked = true
				res.Reason = "erro ao selecionar candidatos: " + err.Error()
				results = append(results, res)
				continue
			}

			res.InWindow = flags.InWindow
			res.PacingOK = flags.PacingOK
			res.HasModem = flags.HasModem
			res.CandidatesFound = len(ranked)

			if channelID == 0 {
				res.Blocked = true
				res.Reason = "grupo sem channel_id — vincule o grupo a um canal em /channels"
				results = append(results, res)
				continue
			}

			if !flags.HasChannel {
				reason := flags.NoChannelReason
				if reason == "" {
					reason = "canal não encontrado ou inativo"
				}
				res.Blocked = true
				res.Reason = reason
				results = append(results, res)
				continue
			}

			if !flags.HasModem {
				res.Blocked = true
				res.Reason = "sem conta WA primary/backup vinculada ao grupo"
				results = append(results, res)
				continue
			}

			if len(ranked) == 0 {
				res.Blocked = true
				res.Reason = "sem candidatos após target.Match + match.Score (verifique target config do canal)"
				results = append(results, res)
				continue
			}

			top := ranked[0]
			res.TopCandidate = &candidateInfo{
				CatalogID:    top.CatalogID,
				Title:        top.Title,
				Score:        top.Score,
				QualityScore: top.QualityScore,
				DiscountPct:  top.DiscountPct,
				Price:        top.Price,
			}

			if !flags.PacingOK {
				// Tem candidatos, mas pacing bloqueia agora — informar sem marcar blocked
				// (o tick teria pulado, mas o dry-run mostra o que enfileiraria)
				res.Blocked = false
				res.Reason = "pacing_blocked — passaria se o gap de pacing fosse respeitado; top candidato disponível"
				results = append(results, res)
				continue
			}

			if !flags.InWindow {
				res.Blocked = false
				res.Reason = "out_of_window — passaria se estivesse na janela de envio; top candidato disponível"
				results = append(results, res)
				continue
			}

			res.Blocked = false
			res.Reason = "ok — enfileiraria no próximo tick"
			results = append(results, res)
		}

		type summary struct {
			TotalGroups  int           `json:"total_groups"`
			WouldEnqueue int           `json:"would_enqueue"`
			Blocked      int           `json:"blocked"`
			Groups       []groupResult `json:"groups"`
		}

		would, blocked := 0, 0
		for _, r := range results {
			if r.Blocked {
				blocked++
			} else {
				would++
			}
		}

		writeJSON(w, http.StatusOK, summary{
			TotalGroups:  len(results),
			WouldEnqueue: would,
			Blocked:      blocked,
			Groups:       results,
		})
	}
}
