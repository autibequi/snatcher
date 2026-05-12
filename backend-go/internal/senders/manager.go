package senders

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// StartAll spawna 1 goroutine RunSender por modem presente na tabela modems.
// Chamado em cmd/server/main.go após DB pronto, antes do http.ListenAndServe.
// Os senders são goroutines persistentes (não cron jobs) — vivem até ctx cancelado.
func StartAll(ctx context.Context, db *sqlx.DB) {
	var modemIDs []int64
	if err := db.SelectContext(ctx, &modemIDs, "SELECT id FROM modems ORDER BY id"); err != nil {
		slog.Error("senders.start_all", "err", err)
		return
	}
	for _, id := range modemIDs {
		go RunSender(ctx, db, id)
	}
	slog.Info("senders.started", "count", len(modemIDs))
}
