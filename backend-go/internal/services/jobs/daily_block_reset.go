package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// DailyBlockResetResult resume o que o reset diário levantou.
type DailyBlockResetResult struct {
	AccountsLifted int64
	ModemsResumed  int64
}

// RunDailyBlockResetOnce abre os bloqueios automáticos à meia-noite (rede de
// segurança redundante ao auto-lift por TTL): nenhuma conta/modem fica desligado
// por mais de um dia por causa de uma janela de falhas.
//
// Escopo deliberado: levanta SÓ 'quarantine' (suspeita por falhas acumuladas) —
// NUNCA 'banned' (ban real do WhatsApp), pois reativar um número banido pode
// queimá-lo de vez. Modems pausados (status='paused', pausa automática com TTL)
// voltam a 'active'.
func RunDailyBlockResetOnce(ctx context.Context, db *sqlx.DB) (DailyBlockResetResult, error) {
	var res DailyBlockResetResult

	accRes, err := db.ExecContext(ctx, `
		UPDATE accounts
		SET status = 'primary', status_changed_at = now(),
		    consecutive_failures = 0, last_failure_at = NULL
		WHERE status = 'quarantine'
	`)
	if err != nil {
		return res, err
	}
	res.AccountsLifted, _ = accRes.RowsAffected()

	// Encerra os eventos de quarentena de conta ainda abertos para não reprocessar
	// no auto-lift e manter a auditoria coerente.
	_, _ = db.ExecContext(ctx, `
		UPDATE quarantine_events
		SET lifted_at = now(), lifted_by = 'daily_block_reset'
		WHERE subject_kind = 'account' AND lifted_at IS NULL
	`)

	modemRes, err := db.ExecContext(ctx, `
		UPDATE modems
		SET status = 'active', paused_until = NULL, paused_reason = NULL
		WHERE status = 'paused'
	`)
	if err != nil {
		return res, err
	}
	res.ModemsResumed, _ = modemRes.RowsAffected()

	slog.InfoContext(ctx, "daily_block_reset: done",
		"accounts_lifted", res.AccountsLifted, "modems_resumed", res.ModemsResumed)
	return res, nil
}
