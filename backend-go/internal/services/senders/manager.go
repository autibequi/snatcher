package senders

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// StartAll roteia entre engine legacy (1 goroutine por modem) e v2 (dispatcher central com worker pool).
// Decisão controlada pela flag `dispatch_engine` em tunable_parameters:
//   - 0 ou NULL (default): legacy — preserva comportamento atual (RunSender por modem).
//   - 1: v2 — RunDispatcher único com pool de N workers (W1 do refactor V3).
//
// Cutover é manual: Pedro flipa o toggle quando shadow seed do modem_routing convergir (<1% drift).
// Ao final de W1 (após 7d estáveis em 100%), o toggle é removido junto com o código legacy.
func StartAll(ctx context.Context, db *sqlx.DB) {
	var engine float64
	if err := db.GetContext(ctx, &engine,
		`SELECT COALESCE(get_param('dispatch_engine','global',NULL), 0)`); err != nil {
		slog.Warn("senders.dispatch_engine_query_failed_using_legacy", "err", err)
		engine = 0
	}

	if engine >= 1 {
		slog.Info("senders.start_all", "engine", "v2_dispatcher")
		go RunDispatcher(ctx, db, DefaultDispatcherConfig())
		return
	}

	// Engine legacy.
	var modemIDs []int64
	if err := db.SelectContext(ctx, &modemIDs, "SELECT id FROM modems ORDER BY id"); err != nil {
		slog.Error("senders.start_all", "err", err)
		return
	}
	for _, id := range modemIDs {
		go RunSender(ctx, db, id)
	}
	slog.Info("senders.started", "engine", "legacy", "count", len(modemIDs))
}
