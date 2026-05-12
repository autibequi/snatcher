package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunGcGroupSentHistory remove registros de group_sent_history com mais de 14 dias.
// Deve rodar às 03:00 via cron job.
func RunGcGroupSentHistory(ctx context.Context, db *sqlx.DB) {
	slog.Info("gc_group_sent_history: iniciando limpeza TTL 14d")

	result, err := db.ExecContext(ctx, `
		DELETE FROM group_sent_history
		WHERE sent_at < now() - INTERVAL '14 days'
	`)
	if err != nil {
		slog.Error("gc_group_sent_history: delete falhou", "err", err)
		return
	}

	n, err := result.RowsAffected()
	if err != nil {
		slog.Warn("gc_group_sent_history: RowsAffected", "err", err)
		return
	}

	slog.Info("gc_group_sent_history: concluído", "rows_deleted", n)
}
