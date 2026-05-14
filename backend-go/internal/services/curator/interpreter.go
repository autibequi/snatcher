package curator

import (
	"context"
	"regexp"
	"strconv"
	"strings"

	"github.com/jmoiron/sqlx"
)

// Intent representa o que o bot entendeu da resposta do humano.
type Intent struct {
	Action     string // "pause_modem", "resume_modem", "disable_loop", "enable_loop", "ignore", "investigate", "unknown"
	TargetID   int64
	Raw        string
	Confidence float64
}

// ParseIntent extrai intenção a partir do texto livre PT-BR (heurística).
func ParseIntent(text string) Intent {
	t := strings.ToLower(strings.TrimSpace(text))
	intent := Intent{Raw: text, Confidence: 0.6}

	// extrai número de modem se presente
	var modemNum int64
	if m := regexp.MustCompile(`modem[\s-]*(\d+)`).FindStringSubmatch(t); len(m) > 1 {
		modemNum, _ = strconv.ParseInt(m[1], 10, 64)
	}

	switch {
	case strings.Contains(t, "pausar") || strings.Contains(t, "pause"):
		intent.Action = "pause_modem"
		intent.TargetID = modemNum
		intent.Confidence = 0.85
	case strings.Contains(t, "retomar") || strings.Contains(t, "resume") || strings.Contains(t, "voltar"):
		intent.Action = "resume_modem"
		intent.TargetID = modemNum
		intent.Confidence = 0.85
	case strings.Contains(t, "ignorar") || strings.Contains(t, "ignore") || strings.Contains(t, "ok"):
		intent.Action = "ignore"
		intent.Confidence = 0.9
	case strings.Contains(t, "desligar loop") || strings.Contains(t, "disable"):
		intent.Action = "disable_loop"
		intent.Confidence = 0.8
	case strings.Contains(t, "reativar") || strings.Contains(t, "enable"):
		intent.Action = "enable_loop"
		intent.Confidence = 0.8
	default:
		intent.Action = "unknown"
		intent.Confidence = 0.0
	}
	return intent
}

// ExecuteIntent aplica a ação ao banco. Ações com impacto devem passar pelo Confirmer antes.
func ExecuteIntent(ctx context.Context, db *sqlx.DB, intent Intent) error {
	switch intent.Action {
	case "pause_modem":
		_, err := db.ExecContext(ctx, `
			UPDATE modems SET status='paused', paused_until=now()+INTERVAL '1 hour', paused_reason='manual_via_curator'
			WHERE id=$1
		`, intent.TargetID)
		if err == nil {
			_, _ = db.ExecContext(ctx, `
				INSERT INTO llm_actions (loop_name, action_type, target_table, target_id, reasoning, evaluation, applied_at)
				VALUES ('curator_manual','applied','modems',$1,$2,'success',now())
			`, intent.TargetID, "manual pause via curator group: "+intent.Raw)
		}
		return err
	case "resume_modem":
		_, err := db.ExecContext(ctx, `
			UPDATE modems SET status='active', paused_until=NULL, paused_reason=NULL WHERE id=$1
		`, intent.TargetID)
		return err
	case "ignore", "unknown":
		return nil
	}
	return nil
}
