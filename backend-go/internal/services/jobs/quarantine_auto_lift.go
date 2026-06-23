package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunQuarantineAutoLiftOnce levanta quarentenas cujo TTL expirou.
// Retorna o número de registros lifted.
// Integração ao Jonfrey scheduler acontece em W5.
func RunQuarantineAutoLiftOnce(ctx context.Context, db *sqlx.DB) (int, error) {
	type row struct {
		ID          int64  `db:"id"`
		SubjectKind string `db:"subject_kind"`
		SubjectID   int64  `db:"subject_id"`
	}

	var expired []row
	err := db.SelectContext(ctx, &expired, `
		SELECT id, subject_kind, subject_id
		FROM quarantine_events
		WHERE quarantine_until < now()
		  AND lifted_at IS NULL
		LIMIT 100
	`)
	if err != nil {
		return 0, err
	}

	lifted := 0
	for _, r := range expired {
		_, err := db.ExecContext(ctx, `
			UPDATE quarantine_events
			SET lifted_at = now(), lifted_by = 'auto_lift_job'
			WHERE id = $1 AND lifted_at IS NULL
		`, r.ID)
		if err != nil {
			slog.WarnContext(ctx, "quarantine_auto_lift: falha ao liftar", "id", r.ID, "err", err)
			continue
		}

		if r.SubjectKind == "account" {
			// 'primary' (não 'active', que nem existe no enum de accounts) — mesma
			// semântica do resume manual (handlers/admin/senders.go). Zera os
			// contadores: voltar com consecutive_failures no limite faria a conta
			// recair na quarentena na primeira falha seguinte. Nunca toca 'banned'.
			_, _ = db.ExecContext(ctx, `
				UPDATE accounts
				SET status = 'primary', status_changed_at = now(),
				    consecutive_failures = 0, last_failure_at = NULL
				WHERE id = $1 AND status = 'quarantine'
			`, r.SubjectID)
		}
		lifted++
	}

	slog.InfoContext(ctx, "quarantine_auto_lift: done", "lifted", lifted, "found", len(expired))
	return lifted, nil
}
