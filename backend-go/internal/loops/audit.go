package loops

import (
	"context"
	"encoding/json"

	"github.com/jmoiron/sqlx"
)

// AuditAction grava uma ação automatizada em llm_actions com before/after.
func AuditAction(ctx context.Context, db *sqlx.DB, loopName, actionType, targetTable string, targetID int64, before, after any, reasoning string, confidence float64) error {
	b, _ := json.Marshal(before)
	a, _ := json.Marshal(after)
	_, err := db.ExecContext(ctx, `
		INSERT INTO llm_actions (loop_name, action_type, target_table, target_id, before_value, after_value, reasoning, confidence, evaluation, applied_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', now())
	`, loopName, actionType, targetTable, targetID, b, a, reasoning, confidence)
	return err
}

// EvaluateAction atualiza llm_actions.evaluation + metrics_after (chamado N dias depois).
func EvaluateAction(ctx context.Context, db *sqlx.DB, actionID int64, eval string, metrics any) error {
	m, _ := json.Marshal(metrics)
	_, err := db.ExecContext(ctx, `
		UPDATE llm_actions SET evaluation=$1, metrics_after=$2, evaluated_at=now()
		WHERE id=$3
	`, eval, m, actionID)
	return err
}
