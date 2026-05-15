package loops

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/notifier"
)

// LoopFunc é a assinatura padrão de um loop.
type LoopFunc func(ctx context.Context, db *sqlx.DB, mode RunMode) error

// loopNotifier é opcional: router chama SetNotifier na subida do servidor.
var loopNotifier *notifier.Notifier

// SetNotifier registra o notifier para sugestões LLM e falhas de loop.
func SetNotifier(n *notifier.Notifier) { loopNotifier = n }

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
		if loopNotifier != nil {
			msg := err.Error()
			if len(msg) > 400 {
				msg = msg[:400] + "…"
			}
			loopNotifier.Notify(notifier.KindLoopFailure, msg, "loop-fail:"+loopName, time.Hour)
		}
	}
}

// Suggest publica em llm_suggestions em vez de aplicar direto.
func Suggest(ctx context.Context, db *sqlx.DB, loopName, targetType string, targetID int64, suggestion string, change any, reasoning string, confidence float64) error {
	c, _ := jsonMarshal(change)
	_, err := db.ExecContext(ctx, `
		INSERT INTO llm_suggestions (loop_name, target_type, target_id, suggestion, proposed_change, reasoning, confidence, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
	`, loopName, targetType, targetID, suggestion, c, reasoning, confidence)
	if err != nil {
		return err
	}

	if loopNotifier != nil {
		summary := strings.TrimSpace(suggestion)
		if len(summary) > 420 {
			summary = summary[:420] + "…"
		}
		reas := strings.TrimSpace(reasoning)
		if reas != "" {
			if len(reas) > 200 {
				reas = reas[:200] + "…"
			}
			summary = summary + "\n\nMotivo: " + reas
		}
		body := fmt.Sprintf("%s · %s #%d\n\n%s\n\nConfiança ~%.0f%%", loopName, targetType, targetID, summary, confidence*100)
		dedup := fmt.Sprintf("suggest:%s:%s:%d", loopName, targetType, targetID)
		loopNotifier.Notify(notifier.KindLLMSuggestion, body, dedup, 8*time.Minute)
	}
	return nil
}

// jsonMarshal é um helper interno para serializar valores.
func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }
