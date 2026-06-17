// Package reports monta e dispara relatórios operacionais derivados das tabelas
// de métricas (clicks, send_log, conversions, ban_events).
//
// Mora num package neutro de propósito: tanto o scheduler (job diário) quanto o
// handler admin (botão "gerar agora") precisam disparar o relatório. Não pode
// viver em services/jobs porque repositories importa jobs e notifier importa
// repositories → jobs→notifier fecharia um import cycle. reports só depende de
// notifier + sqlx, e ninguém abaixo dele o importa.
package reports

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/notifier"
)

// RunDailyMetricsReport agrega as métricas das últimas 24h, monta o resumo e
// (se houver notifier + grupo configurado) envia pro grupo de alertas via WhatsApp.
// Retorna o texto do resumo (pra preview na UI) e erro só se a agregação falhar.
//
// manual=true (botão da UI): envia SEMPRE, sem dedup — o usuário pediu agora.
// manual=false (cron meia-noite BRT): usa dedup diário pra não duplicar em re-deploy.
//
// Best-effort no envio: o Notify é async e nunca quebra o caller; sem grupo
// configurado vira no-op silencioso (mas o preview ainda é retornado).
func RunDailyMetricsReport(ctx context.Context, db *sqlx.DB, notif *notifier.Notifier, manual bool) (string, error) {
	if db == nil {
		return "", fmt.Errorf("reports: db nil")
	}

	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		loc = time.FixedZone("BRT", -3*3600)
	}
	// Rótulo do relatório: o dia BRT que acabou de fechar (à meia-noite, é "ontem").
	day := time.Now().In(loc).Add(-time.Minute).Format("02/01/2006")

	// Totais do dia numa só ida ao banco (subqueries — sem FROM no SELECT raiz).
	type dailyTotals struct {
		Clicks      int64   `db:"clicks"`
		Sends       int64   `db:"sends"`
		GroupsSent  int64   `db:"groups_sent"`
		Conversions int64   `db:"conversions"`
		Revenue     float64 `db:"revenue"`
		Bans        int64   `db:"bans"`
	}
	var t dailyTotals
	err = db.GetContext(ctx, &t, `
		SELECT
			(SELECT COUNT(*) FROM clicks
			 WHERE clicked_at >= NOW() - INTERVAL '24 hours') AS clicks,
			(SELECT COUNT(*) FROM send_log
			 WHERE sent_at >= NOW() - INTERVAL '24 hours' AND status = 'sent') AS sends,
			(SELECT COUNT(DISTINCT group_id) FROM send_log
			 WHERE sent_at >= NOW() - INTERVAL '24 hours' AND status = 'sent') AS groups_sent,
			(SELECT COUNT(*) FROM conversions
			 WHERE occurred_at >= NOW() - INTERVAL '24 hours' AND status = 'confirmed') AS conversions,
			(SELECT COALESCE(SUM(order_value), 0) FROM conversions
			 WHERE occurred_at >= NOW() - INTERVAL '24 hours' AND status = 'confirmed') AS revenue,
			(SELECT COUNT(*) FROM ban_events
			 WHERE detected_at >= NOW() - INTERVAL '24 hours') AS bans
	`)
	if err != nil {
		return "", fmt.Errorf("reports: totals query: %w", err)
	}

	// Top 3 grupos por cliques no dia (nome via JOIN em groups). Não-fatal.
	type topGroup struct {
		Name   string `db:"name"`
		Clicks int64  `db:"clicks"`
	}
	var top []topGroup
	if topErr := db.SelectContext(ctx, &top, `
		SELECT g.name AS name, COUNT(*) AS clicks
		FROM clicks k
		JOIN groups g ON g.id = k.group_id
		WHERE k.clicked_at >= NOW() - INTERVAL '24 hours'
		  AND k.group_id IS NOT NULL
		GROUP BY g.id, g.name
		ORDER BY clicks DESC
		LIMIT 3
	`); topErr != nil {
		slog.Warn("reports: top groups query", "err", topErr)
	}

	ctr := 0.0
	if t.Sends > 0 {
		ctr = 100.0 * float64(t.Clicks) / float64(t.Sends)
	}

	// Texto em markdown do WhatsApp (*bold*). O Notifier prefixa "🤖 *Relatório diário*".
	var b strings.Builder
	fmt.Fprintf(&b, "📅 %s\n\n", day)
	fmt.Fprintf(&b, "• 📤 Posts enviados: *%d* (em %d grupos)\n", t.Sends, t.GroupsSent)
	fmt.Fprintf(&b, "• 👆 Cliques: *%d*\n", t.Clicks)
	fmt.Fprintf(&b, "• 🎯 CTR: *%.1f%%*\n", ctr)
	fmt.Fprintf(&b, "• 🛒 Conversões: *%d*\n", t.Conversions)
	fmt.Fprintf(&b, "• 💰 Receita: *R$ %.2f*\n", t.Revenue)
	if t.Bans > 0 {
		fmt.Fprintf(&b, "• 🚫 Banimentos: *%d*\n", t.Bans)
	}
	if len(top) > 0 {
		b.WriteString("\n🏆 Top grupos (cliques):\n")
		for i, g := range top {
			fmt.Fprintf(&b, "%d. %s — %d\n", i+1, g.Name, g.Clicks)
		}
	}
	body := b.String()

	if notif != nil {
		// dedupKey vazio no modo manual = envia sempre; no cron, 1x/dia.
		dedupKey := ""
		if !manual {
			dedupKey = "daily-report:" + day
		}
		notif.Notify(notifier.KindDailyReport, body, dedupKey, 23*time.Hour)
	} else {
		slog.Warn("reports: notifier nil — preview gerado mas não enviado")
	}

	// Persiste o último relatório (single-row id=1) pra exibir como referência no
	// dashboard. Captura tanto o cron quanto o botão manual (ponto único de geração).
	source := "cron"
	if manual {
		source = "manual"
	}
	if _, dbErr := db.ExecContext(ctx, `
		INSERT INTO last_daily_report (id, report_text, source, sent, generated_at)
		VALUES (1, $1, $2, $3, now())
		ON CONFLICT (id) DO UPDATE
		    SET report_text  = EXCLUDED.report_text,
		        source       = EXCLUDED.source,
		        sent         = EXCLUDED.sent,
		        generated_at = EXCLUDED.generated_at
	`, body, source, notif != nil); dbErr != nil {
		slog.Warn("reports: persist last_daily_report", "err", dbErr)
	}

	slog.Info("reports: daily metrics report",
		"manual", manual, "day", day, "sends", t.Sends, "clicks", t.Clicks,
		"ctr_pct", ctr, "conversions", t.Conversions, "revenue", t.Revenue, "bans", t.Bans)
	return body, nil
}
