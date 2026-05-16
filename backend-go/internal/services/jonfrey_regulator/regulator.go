package jonfrey_regulator

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// AntiLoopCooldown é o tempo mínimo entre decisões opostas (pause↔resume) para o mesmo automation.
const AntiLoopCooldown = time.Hour

// OscillationThreshold é o número de pares pause/resume que dispara escalate_to_human.
const OscillationThreshold = 3

// OscillationWindow é a janela de tempo em que o OscillationThreshold é avaliado.
const OscillationWindow = 24 * time.Hour

// Decision representa o tipo de decisão registrado em jonfrey_decisions.
type Decision string

const (
	// DecisionPause desabilita uma automation elective controlada por Jonfrey.
	DecisionPause Decision = "pause"

	// DecisionResume reabilita uma automation elective controlada por Jonfrey.
	DecisionResume Decision = "resume"

	// DecisionTune ajusta parâmetros internos de uma automation (ex: exploration_factor).
	DecisionTune Decision = "tune"

	// DecisionFreezeChannel marca um canal como não-dispatchável pelo bandit.
	DecisionFreezeChannel Decision = "freeze_channel"

	// DecisionEscalateToHuman emite alerta quando oscilação persiste acima do threshold.
	DecisionEscalateToHuman Decision = "escalate_to_human"
)

// CanDecide verifica se a decisão pode ser aplicada ao automation_id informado.
// Retorna (false, motivo) quando a decisão viola cooldown ou o guard de oscilação.
// Deve ser consultado antes de qualquer chamada a PauseAutomation ou ResumeAutomation.
func CanDecide(ctx context.Context, db *sqlx.DB, automationID string, decision Decision) (bool, string) {
	lastDecision, lastAt, found := fetchLastDecision(ctx, db, automationID)
	if found && isOpposite(lastDecision, string(decision)) && time.Since(lastAt) < AntiLoopCooldown {
		return false, "cooldown_active"
	}

	oscillationCount := countRecentFlips(ctx, db, automationID)
	if oscillationCount >= OscillationThreshold*2 {
		return false, "oscillation_detected"
	}

	return true, ""
}

// fetchLastDecision consulta a decisão mais recente para um automation_id.
// Retorna (decision, created_at, found).
func fetchLastDecision(ctx context.Context, db *sqlx.DB, automationID string) (string, time.Time, bool) {
	var lastDecision string
	var lastAt time.Time

	err := db.QueryRowContext(ctx, `
		SELECT decision::text, created_at
		FROM jonfrey_decisions
		WHERE automation_id = $1
		ORDER BY created_at DESC
		LIMIT 1`,
		automationID,
	).Scan(&lastDecision, &lastAt)

	if err != nil {
		return "", time.Time{}, false
	}

	return lastDecision, lastAt, true
}

// countRecentFlips conta o número de decisões pause/resume nas últimas 24h para o automation_id.
func countRecentFlips(ctx context.Context, db *sqlx.DB, automationID string) int {
	var count int

	_ = db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM jonfrey_decisions
		WHERE automation_id = $1
		  AND created_at > now() - interval '24 hours'
		  AND decision IN ('pause', 'resume')`,
		automationID,
	)

	return count
}

// isOpposite retorna true quando prev e current formam um par pause↔resume.
func isOpposite(prev, current string) bool {
	pauseToResume := prev == "pause" && current == "resume"
	resumeToPause := prev == "resume" && current == "pause"

	return pauseToResume || resumeToPause
}

// RecordDecision insere uma linha em jonfrey_decisions com a decisão tomada pelo regulator.
// O campo payload aceita qualquer valor serializável em JSON (pode ser nil).
func RecordDecision(ctx context.Context, db *sqlx.DB, automationID string, decision Decision, reason string, payload any) error {
	encodedPayload := encodePayload(payload)

	_, err := db.ExecContext(ctx, `
		INSERT INTO jonfrey_decisions (automation_id, decision, reason, payload)
		VALUES ($1, $2, $3, $4::jsonb)`,
		automationID,
		string(decision),
		reason,
		encodedPayload,
	)

	return err
}

// encodePayload serializa o payload para JSON.
// Retorna "null" se o payload for nil ou se a serialização falhar.
func encodePayload(payload any) string {
	if payload == nil {
		return "null"
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return "null"
	}

	return string(raw)
}

// PauseAutomation desabilita uma automation, respeitando anti-loop guard e invariante I10.
// Apenas automations com kind='elective' e controlled_by_jonfrey=true podem ser pausadas.
// Se o guard de oscilação estiver ativo, emite DecisionEscalateToHuman em vez de bloquear silenciosamente.
func PauseAutomation(ctx context.Context, db *sqlx.DB, automationID, reason string) error {
	allowed, blockReason := CanDecide(ctx, db, automationID, DecisionPause)
	if !allowed {
		if blockReason == "oscillation_detected" {
			_ = RecordDecision(ctx, db, automationID, DecisionEscalateToHuman, "oscillation_detected", nil)
			slog.Warn("regulator.escalate", "automation", automationID)
		}

		return nil
	}

	rowsAffected, err := applyPause(ctx, db, automationID)
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		// Automation não existe, é critical, ou não está controlled_by_jonfrey — skip silencioso (I10).
		slog.Info("regulator.pause_skipped_not_elective", "automation", automationID)
		return nil
	}

	return RecordDecision(ctx, db, automationID, DecisionPause, reason, nil)
}

// applyPause executa o UPDATE de enabled=FALSE respeitando a restrição de kind e controlled_by_jonfrey.
// Retorna o número de linhas afetadas.
func applyPause(ctx context.Context, db *sqlx.DB, automationID string) (int64, error) {
	result, err := db.ExecContext(ctx, `
		UPDATE automations
		SET enabled = FALSE, updated_at = now()
		WHERE id = $1
		  AND kind = 'elective'
		  AND controlled_by_jonfrey = TRUE`,
		automationID,
	)
	if err != nil {
		return 0, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	return rowsAffected, nil
}

// ResumeAutomation reabilita uma automation elective controlada por Jonfrey.
// O cooldown guard é consultado antes de aplicar; se ativo, a ação é silenciosamente ignorada.
func ResumeAutomation(ctx context.Context, db *sqlx.DB, automationID, reason string) error {
	allowed, _ := CanDecide(ctx, db, automationID, DecisionResume)
	if !allowed {
		return nil
	}

	err := applyResume(ctx, db, automationID)
	if err != nil {
		return err
	}

	return RecordDecision(ctx, db, automationID, DecisionResume, reason, nil)
}

// applyResume executa o UPDATE de enabled=TRUE respeitando a restrição de kind e controlled_by_jonfrey.
func applyResume(ctx context.Context, db *sqlx.DB, automationID string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE automations
		SET enabled = TRUE, updated_at = now()
		WHERE id = $1
		  AND kind = 'elective'
		  AND controlled_by_jonfrey = TRUE`,
		automationID,
	)

	return err
}

// RegulateChannelBandit é chamado pelo supervisor Jonfrey a cada ciclo de análise.
// Observa channel_score_weights.ucb1_state e decide:
//   - aumentar exploration_factor se o canal estiver estagnado (pulls altos sem melhora de reward)
//   - freeze_channel se o CTR vs baseline (W-1) caiu mais de 10% de forma sustentada
//
// Placeholder: a query de baseline-vs-now é feature de W6. Por ora registra presença no log.
func RegulateChannelBandit(ctx context.Context, db *sqlx.DB, channelID int64) error {
	slog.Debug("regulator.bandit.tick", "channel_id", channelID)

	return nil
}
