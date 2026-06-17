package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/notifier"
)

// runDailyMetricsReport agrega as métricas das últimas 24h e envia um resumo
// formatado pro grupo de alertas (Settings → Notificações) via Notifier.
//
// Mora no package scheduler (e não em services/jobs) de propósito: o jobs é
// importado por repositories (job_persistence.go), e notifier importa
// repositories — então jobs → notifier fecharia um import cycle. O scheduler é
// o topo da cadeia e já depende de ambos, sendo o lar natural deste job.
//
// Roda à meia-noite BRT (cron "0 3 * * *" = 03:00 UTC, pois o scheduler usa UTC).
// A janela de 24h fecha exatamente o dia BRT que acabou. Best-effort: nunca
// quebra o scheduler — erros viram slog. Sem grupo configurado, o Notifier é no-op.
func runDailyMetricsReport(ctx context.Context, db *sqlx.DB, notif *notifier.Notifier) {
	if db == nil || notif == nil {
		slog.Warn("metrics_report: db ou notifier nil — skip")
		return
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
		slog.Error("metrics_report: totals query", "err", err)
		return
	}

	// Top 3 grupos por cliques no dia (nome via JOIN em groups).
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
		// Não-fatal: o resumo principal vale sem o ranking.
		slog.Warn("metrics_report: top groups query", "err", topErr)
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

	// dedupKey por dia evita duplicata se o job rodar duas vezes (ex.: re-deploy).
	notif.Notify(notifier.KindDailyReport, b.String(), "daily-report:"+day, 23*time.Hour)
	slog.Info("metrics_report: resumo enviado",
		"day", day, "sends", t.Sends, "clicks", t.Clicks, "ctr_pct", ctr,
		"conversions", t.Conversions, "revenue", t.Revenue, "bans", t.Bans)
}
