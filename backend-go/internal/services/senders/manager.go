package senders

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// StartAll inicia o motor de envio. Desde o refactor 2026-06 (W2) existe um único
// engine: o dispatcher central com worker pool (RunDispatcher). O engine legacy
// (1 goroutine por modem via RunSender) e a flag `dispatch_engine` em
// tunable_parameters foram removidos — v2 é o caminho único.
func StartAll(ctx context.Context, db *sqlx.DB) {
	slog.Info("senders.start_all", "engine", "v2_dispatcher")
	go RunDispatcher(ctx, db, DefaultDispatcherConfig())
}
