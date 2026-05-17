package jonfrey_regulator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

// EscalateFunc é chamada quando o anti-loop guard detecta oscilação acima do threshold.
// Implementada por quem injeta o regulator (ex: router.go → hub.Broadcast).
// Deve ser não-bloqueante ou rápida — é chamada no caminho crítico de PauseAutomation.
type EscalateFunc func(ctx context.Context, automationID string, reason string)

var (
	escalateMu sync.RWMutex
	escalateFn EscalateFunc
)

// SetEscalateFunc registra a função a ser invocada quando escalate_to_human ocorrer.
// Seguro para chamada concorrente. Sobrescreve registros anteriores.
// Chamar com nil desabilita o hook (volta ao comportamento padrão: só slog.Warn).
func SetEscalateFunc(fn EscalateFunc) {
	escalateMu.Lock()
	escalateFn = fn
	escalateMu.Unlock()
}

// callEscalateFn invoca a EscalateFunc registrada, se houver.
func callEscalateFn(ctx context.Context, automationID, reason string) {
	escalateMu.RLock()
	fn := escalateFn
	escalateMu.RUnlock()
	if fn != nil {
		fn(ctx, automationID, reason)
	}
}

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

// countRecentFlips conta o número de decisões pause/resume dentro de OscillationWindow para o automation_id.
func countRecentFlips(ctx context.Context, db *sqlx.DB, automationID string) int {
	var count int

	windowSecs := int64(OscillationWindow.Seconds())
	_ = db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM jonfrey_decisions
		WHERE automation_id = $1
		  AND created_at > now() - ($2 * interval '1 second')
		  AND decision IN ('pause', 'resume')`,
		automationID, windowSecs,
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
			slog.Warn("regulator.escalate_to_human", "automation", automationID, "reason", blockReason)
			callEscalateFn(ctx, automationID, blockReason)
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

// explorationFloor é o threshold abaixo do qual o canal é considerado em exploitation excessivo.
// Se exploration_factor < explorationFloor, o regulator aumenta para explorationTarget.
const explorationFloor = 0.1

// explorationTarget é o valor alvo quando o canal precisa de mais exploração.
const explorationTarget = 0.15

// explorationMin é o limite mínimo do exploration_factor por canal.
const explorationMin = 0.05

// explorationMax é o limite máximo do exploration_factor por canal.
const explorationMax = 0.50

// explorationStep é o incremento/decremento aplicado em cada ajuste de win_rate.
const explorationStep = 0.05

// explorationDefault é o valor usado para cold-start (ainda sem tunable row).
const explorationDefault = 0.40

// coldStartThreshold define o mínimo de pulls totais para o regulator agir.
// Abaixo desse valor, o canal está em cold-start e não deve ser regulado.
const coldStartThreshold = 100

// channelBanditState contém o estado resumido do UCB1 para um canal.
type channelBanditState struct {
	TotalPulls  int
	RewardSum   float64
	ExplorationFactor float64 // valor atual em tunable_parameters (scope=channel) ou global fallback
}

// banditArm é um subconjunto do algo.Arm para deserialização local.
type banditArm struct {
	Pulls  int     `json:"pulls"`
	Reward float64 `json:"reward"`
}

// fetchChannelState lê ucb1_state de channel_score_weights e o exploration_factor
// do canal em tunable_parameters (scope 'channel'), com fallback para o global.
func fetchChannelState(ctx context.Context, db *sqlx.DB, channelID int64) (channelBanditState, error) {
	var ucb1Raw string
	err := db.GetContext(ctx, &ucb1Raw,
		`SELECT COALESCE(ucb1_state::text, '[]') FROM channel_score_weights WHERE channel_id = $1`,
		channelID,
	)
	if err != nil {
		// Canal ainda sem row — cold-start, não regular.
		return channelBanditState{}, nil
	}

	var arms []banditArm
	if jsonErr := json.Unmarshal([]byte(ucb1Raw), &arms); jsonErr != nil {
		return channelBanditState{}, fmt.Errorf("fetchChannelState: ucb1_state decode: %w", jsonErr)
	}

	var totalPulls int
	var rewardSum float64
	for _, a := range arms {
		totalPulls += a.Pulls
		rewardSum += a.Reward
	}

	// Lê exploration_factor (epsilon_base) do canal, com fallback global.
	var ef float64
	efErr := db.GetContext(ctx, &ef, `
		SELECT COALESCE(
			(SELECT current_value FROM tunable_parameters
			 WHERE param_name = 'epsilon_base' AND scope_type = 'channel' AND scope_id = $1),
			(SELECT current_value FROM tunable_parameters
			 WHERE param_name = 'epsilon_base' AND scope_type = 'global' AND scope_id IS NULL),
			$2
		)`,
		channelID, explorationDefault,
	)
	if efErr != nil {
		ef = explorationDefault
	}

	return channelBanditState{
		TotalPulls:        totalPulls,
		RewardSum:         rewardSum,
		ExplorationFactor: ef,
	}, nil
}

// applyExplorationTune ajusta o exploration_factor em tunable_parameters para o canal
// e registra a decisão em jonfrey_decisions.
func applyExplorationTune(ctx context.Context, db *sqlx.DB, channelID int64, newFactor float64, reason string) error {
	// Upsert no tunable_parameters com scope 'channel' + scope_id = channelID.
	_, err := db.ExecContext(ctx, `
		INSERT INTO tunable_parameters
			(scope_type, scope_id, param_name, current_value, default_value, min_value, max_value, last_changed, last_change_by)
		VALUES
			('channel', $1, 'epsilon_base', $2, $3, $4, $5, now(), 'jonfrey_regulator')
		ON CONFLICT (scope_type, scope_id, param_name) DO UPDATE
			SET current_value  = EXCLUDED.current_value,
			    last_changed   = now(),
			    last_change_by = 'jonfrey_regulator'`,
		channelID, newFactor, explorationDefault, explorationMin, explorationMax,
	)
	if err != nil {
		return fmt.Errorf("applyExplorationTune: upsert tunable: %w", err)
	}

	payload := map[string]any{"channel_id": channelID, "exploration_factor": newFactor}
	return RecordDecision(ctx, db, "tune_bandit_exploration", DecisionTune, reason, payload)
}

// RegulateChannelBandit observa ucb1_state do canal e ajusta exploration_factor.
// Lógica W5:
//   - cold-start (total pulls < 100): não age.
//   - win_rate > 0.7 (canal muito bom): diminui exploration (mais exploit).
//   - win_rate < 0.3 (canal ruim): aumenta exploration (mais explore).
//   - exploration_factor < explorationFloor independente de win_rate: restaura para explorationTarget.
//
// Freeze completo de canal é feature de W6 (baseline-vs-CTR).
func RegulateChannelBandit(ctx context.Context, db *sqlx.DB, channelID int64) error {
	state, err := fetchChannelState(ctx, db, channelID)
	if err != nil {
		return fmt.Errorf("RegulateChannelBandit ch=%d: %w", channelID, err)
	}

	// Cold-start: menos de 100 pulls — não regular ainda.
	if state.TotalPulls < coldStartThreshold {
		slog.Debug("regulator.bandit.cold_start", "channel_id", channelID, "pulls", state.TotalPulls)
		return nil
	}

	ef := state.ExplorationFactor

	// Exploitation excessivo: exploration abaixo do floor → restaurar para target.
	if ef < explorationFloor {
		reason := fmt.Sprintf("exploration_factor=%.3f below floor=%.2f; restoring to %.2f", ef, explorationFloor, explorationTarget)
		slog.Info("regulator.bandit.tune", "channel_id", channelID, "reason", reason)
		return applyExplorationTune(ctx, db, channelID, explorationTarget, reason)
	}

	winRate := state.RewardSum / float64(state.TotalPulls)

	if winRate > 0.7 {
		// Canal performando bem: diminuir exploração (mais exploit).
		newEF := ef - explorationStep
		if newEF < explorationMin {
			newEF = explorationMin
		}
		if newEF == ef {
			return nil // já no mínimo
		}
		reason := fmt.Sprintf("win_rate=%.3f>0.7; decreasing exploration_factor %.3f→%.3f", winRate, ef, newEF)
		slog.Info("regulator.bandit.tune", "channel_id", channelID, "reason", reason)
		return applyExplorationTune(ctx, db, channelID, newEF, reason)
	}

	if winRate < 0.3 {
		// Canal com baixo reward: aumentar exploração.
		newEF := ef + explorationStep
		if newEF > explorationMax {
			newEF = explorationMax
		}
		if newEF == ef {
			return nil // já no máximo
		}
		reason := fmt.Sprintf("win_rate=%.3f<0.3; increasing exploration_factor %.3f→%.3f", winRate, ef, newEF)
		slog.Info("regulator.bandit.tune", "channel_id", channelID, "reason", reason)
		return applyExplorationTune(ctx, db, channelID, newEF, reason)
	}

	slog.Debug("regulator.bandit.no_action", "channel_id", channelID, "win_rate", winRate, "exploration_factor", ef)
	return nil
}
