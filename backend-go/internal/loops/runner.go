package loops

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// LoopFunc é a assinatura padrão de um loop.
type LoopFunc func(ctx context.Context, db *sqlx.DB, mode RunMode) error

// RunMode indica em que modo o loop deve operar.
type RunMode string

const (
	ModeActive     RunMode = "active"     // aplica direto + grava llm_actions
	ModeSuggesting RunMode = "suggesting" // só publica llm_suggestions
	ModeDisabled   RunMode = "disabled"   // no-op
)

// RunLoop é o wrapper genérico chamado pelo scheduler.
func RunLoop(ctx context.Context, db *sqlx.DB, loopName string, fn LoopFunc) {
	status, err := LoopStatus(ctx, db, loopName)
	if err != nil {
		slog.Error("loop.status", "loop", loopName, "err", err)
		return
	}
	if status == "" || status == string(ModeDisabled) {
		slog.Debug("loop.skip", "loop", loopName, "status", status)
		return
	}
	mode := RunMode(status)
	if err := fn(ctx, db, mode); err != nil {
		slog.Error("loop.run", "loop", loopName, "err", err)
		// erro de execução é strike
		_ = AddStrike(ctx, db, loopName)
	}
}

// Suggest publica em llm_suggestions em vez de aplicar direto.
func Suggest(ctx context.Context, db *sqlx.DB, loopName, targetType string, targetID int64, suggestion string, change any, reasoning string, confidence float64) error {
	c, _ := jsonMarshal(change)
	_, err := db.ExecContext(ctx, `
		INSERT INTO llm_suggestions (loop_name, target_type, target_id, suggestion, proposed_change, reasoning, confidence, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
	`, loopName, targetType, targetID, suggestion, c, reasoning, confidence)
	return err
}

// jsonMarshal é um helper interno para serializar valores.
func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }
