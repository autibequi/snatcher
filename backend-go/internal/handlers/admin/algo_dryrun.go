package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/algo/dry-run
// Simula um tick do Score Engine sem enviar nada.
// Para cada grupo ativo, inspeciona cada etapa e devolve o motivo do bloqueio.
func AlgoDryRunHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		type groupResult struct {
			GroupID     int64   `json:"group_id"`
			GroupName   string  `json:"group_name"`
			ChannelName *string `json:"channel_name,omitempty"`
			// Estado resumido
			Blocked bool   `json:"blocked"`
			Reason  string `json:"reason"` // motivo do bloqueio ou "ok — enfileiraria"
			// Detalhes
			DailyMsgCap      int     `json:"daily_msg_cap"`
			SentToday        int     `json:"sent_today"`
			CandidatesFound  int     `json:"candidates_found"`  // produtos elegíveis (top-K)
			HasModem         bool    `json:"has_modem"`          // group_admins com conta ativa
			SendQueueExists  bool    `json:"send_queue_exists"`
			QualityThreshold float64 `json:"quality_threshold"`
			CatalogSendReady int     `json:"catalog_send_ready"` // total de produtos send_ready no catálogo
		}

		// 1. Lê quality_threshold global
		var qThreshold float64
		_ = db.QueryRowContext(ctx,
			`SELECT COALESCE(get_param('quality_threshold','global',NULL), 0.4)`).Scan(&qThreshold)

		// 2. Verifica se send_queue existe
		var sendQueueExists bool
		_ = db.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='send_queue')`).Scan(&sendQueueExists)

		// 3. Total de produtos send_ready no catálogo
		var totalSendReady int
		_ = db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM catalog WHERE send_ready=true AND canonical_url_alive=true AND COALESCE(quality_score,0)>=$1`,
			qThreshold).Scan(&totalSendReady)

		// 4. Grupos ativos
		type groupRow struct {
			ID          int64   `db:"id"`
			Name        string  `db:"name"`
			ChannelID   *int64  `db:"channel_id"`
			ChannelName *string `db:"channel_name"`
			DailyMsgCap int     `db:"daily_msg_cap"`
		}
		var groups []groupRow
		_ = db.SelectContext(ctx, &groups, `
			SELECT g.id, COALESCE(g.name, g.whatsapp_jid, g.id::text) AS name,
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
				GroupID:         g.ID,
				GroupName:       g.Name,
				ChannelName:     g.ChannelName,
				DailyMsgCap:     g.DailyMsgCap,
				SendQueueExists: sendQueueExists,
				QualityThreshold: qThreshold,
				CatalogSendReady: totalSendReady,
			}

			// Verifica cap diário
			if g.DailyMsgCap <= 0 {
				res.Blocked = true
				res.Reason = "daily_msg_cap = 0 — grupo sem cap configurado (grupos com cap=0 são pulados)"
				results = append(results, res)
				continue
			}

			var sentToday int
			_ = db.QueryRowContext(ctx, `
				SELECT COUNT(*) FROM send_log
				WHERE group_id=$1 AND sent_at::date=CURRENT_DATE AND status='sent'
			`, g.ID).Scan(&sentToday)
			res.SentToday = sentToday

			if sentToday >= g.DailyMsgCap {
				res.Blocked = true
				res.Reason = "cap diário atingido (sent_today >= daily_msg_cap)"
				results = append(results, res)
				continue
			}

			// Verifica modem/conta WA
			var modemCount int
			_ = db.QueryRowContext(ctx, `
				SELECT COUNT(*) FROM group_admins ga
				JOIN accounts a ON a.id = ga.account_id
				WHERE ga.group_id=$1 AND a.status IN ('primary','backup')
			`, g.ID).Scan(&modemCount)
			res.HasModem = modemCount > 0

			if !res.HasModem {
				res.Blocked = true
				res.Reason = "sem conta WA primary/backup vinculada ao grupo (group_admins vazio ou status != primary/backup)"
				results = append(results, res)
				continue
			}

			// send_queue precisa existir para enqueueSend funcionar
			if !sendQueueExists {
				res.Blocked = true
				res.Reason = "tabela send_queue não existe — rode make migrate-up para criar"
				results = append(results, res)
				continue
			}

			// Conta candidatos para o grupo
			channelID := int64(0)
			if g.ChannelID != nil {
				channelID = *g.ChannelID
			}
			if channelID == 0 {
				res.Blocked = true
				res.Reason = "grupo sem channel_id — vincule o grupo a um canal em /channels"
				results = append(results, res)
				continue
			}

			var candidates int
			_ = db.QueryRowContext(ctx, `
				SELECT COUNT(*) FROM catalog c
				WHERE c.send_ready = true
				  AND c.canonical_url_alive = true
				  AND COALESCE(c.quality_score, 0) >= $1
				  AND EXISTS (
				      SELECT 1 FROM channel_category_weights ccw
				      WHERE ccw.channel_id = $2
				        AND ccw.category_id = c.category_id
				        AND ccw.weight > 0
				  )
				  AND NOT EXISTS (
				      SELECT 1 FROM group_sent_history h
				      WHERE h.group_id = $3 AND h.dedup_key = c.dedup_key
				        AND h.sent_at > now() - INTERVAL '7 days'
				  )
			`, qThreshold, channelID, g.ID).Scan(&candidates)
			res.CandidatesFound = candidates

			if candidates == 0 {
				// Tenta diagnosticar sub-causa
				var sendReadyForChannel int
				_ = db.QueryRowContext(ctx, `
					SELECT COUNT(*) FROM catalog c
					WHERE c.send_ready=true AND c.canonical_url_alive=true
					  AND COALESCE(c.quality_score,0)>=$1
					  AND EXISTS (
					      SELECT 1 FROM channel_category_weights ccw
					      WHERE ccw.channel_id=$2 AND ccw.category_id=c.category_id AND ccw.weight>0
					  )
				`, qThreshold, channelID).Scan(&sendReadyForChannel)

				if sendReadyForChannel == 0 {
					var channelHasWeights int
					_ = db.QueryRowContext(ctx,
						`SELECT COUNT(*) FROM channel_category_weights WHERE channel_id=$1 AND weight>0`,
						channelID).Scan(&channelHasWeights)
					if channelHasWeights == 0 {
						res.Reason = "canal sem sliders de categoria configurados — defina pesos em /channels"
					} else {
						res.Reason = "sem produtos send_ready nessas categorias (quality_score abaixo do threshold ou sem produtos nas categorias do canal)"
					}
				} else {
					res.Reason = "todos os produtos elegíveis já foram enviados nos últimos 7 dias (anti-repeat 7d)"
				}
				res.Blocked = true
				results = append(results, res)
				continue
			}

			res.Blocked = false
			res.Reason = "ok — enfileiraria no próximo tick"
			results = append(results, res)
		}

		type summary struct {
			TotalGroups     int           `json:"total_groups"`
			WouldEnqueue    int           `json:"would_enqueue"`
			Blocked         int           `json:"blocked"`
			CatalogReady    int           `json:"catalog_send_ready"`
			SendQueueExists bool          `json:"send_queue_exists"`
			Groups          []groupResult `json:"groups"`
		}

		would, blocked := 0, 0
		for _, r := range results {
			if r.Blocked {
				blocked++
			} else {
				would++
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(summary{
			TotalGroups:     len(results),
			WouldEnqueue:    would,
			Blocked:         blocked,
			CatalogReady:    totalSendReady,
			SendQueueExists: sendQueueExists,
			Groups:          results,
		})
	}
}
