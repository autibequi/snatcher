package jonfrey_regulator

import (
	"context"
	"fmt"
	"testing"
	"time"

	"snatcher/backendv2/internal/testutil"
)

// TestAntiLoopGuard_CooldownRespected verifica que decisão oposta dentro de AntiLoopCooldown é bloqueada.
// Cenário: insere pause decision recente → CanDecide(resume) deve retornar false/cooldown_active.
func TestAntiLoopGuard_CooldownRespected(t *testing.T) {
	db := testutil.MustPG(t)
	ctx := context.Background()

	automationID := fmt.Sprintf("test_cooldown_%d", time.Now().UnixNano())

	// Seed automation elective controlada por jonfrey.
	_, err := db.ExecContext(ctx, `
		INSERT INTO automations (id, kind, enabled, controlled_by_jonfrey)
		VALUES ($1, 'elective', TRUE, TRUE)`,
		automationID,
	)
	if err != nil {
		t.Fatalf("seed automation: %v", err)
	}

	// Inserir decisão pause recente (5 minutos atrás — dentro do cooldown de 1h).
	_, err = db.ExecContext(ctx, `
		INSERT INTO jonfrey_decisions (automation_id, decision, reason, created_at)
		VALUES ($1, 'pause', 'test_setup', now() - interval '5 minutes')`,
		automationID,
	)
	if err != nil {
		t.Fatalf("insert pause decision: %v", err)
	}

	// CanDecide(resume) deve retornar false/cooldown_active — oposta dentro do cooldown.
	allowed, reason := CanDecide(ctx, db, automationID, DecisionResume)
	if allowed {
		t.Error("esperado CanDecide(resume)=false dentro do cooldown de 1h")
	}
	if reason != "cooldown_active" {
		t.Errorf("esperado reason='cooldown_active', got %q", reason)
	}

	// Depois de AntiLoopCooldown, a decisão oposta deve ser permitida.
	// Simulamos "passagem do tempo" inserindo uma decisão muito antiga.
	_, err = db.ExecContext(ctx, `
		UPDATE jonfrey_decisions
		SET created_at = now() - interval '2 hours'
		WHERE automation_id = $1`,
		automationID,
	)
	if err != nil {
		t.Fatalf("update decision timestamp: %v", err)
	}

	allowed, _ = CanDecide(ctx, db, automationID, DecisionResume)
	if !allowed {
		t.Error("esperado CanDecide(resume)=true após cooldown expirado (2h atrás)")
	}
}

// TestAntiLoopGuard_ThreeOscillations verifica que 3 pares pause/resume em 24h disparam escalate_to_human.
// Cenário: insere 6 decisões alternadas → PauseAutomation chama EscalateFunc + grava escalate_to_human em DB.
func TestAntiLoopGuard_ThreeOscillations(t *testing.T) {
	db := testutil.MustPG(t)
	ctx := context.Background()

	automationID := fmt.Sprintf("test_oscillation_%d", time.Now().UnixNano())

	// Seed automation.
	_, err := db.ExecContext(ctx, `
		INSERT INTO automations (id, kind, enabled, controlled_by_jonfrey)
		VALUES ($1, 'elective', TRUE, TRUE)`,
		automationID,
	)
	if err != nil {
		t.Fatalf("seed automation: %v", err)
	}

	// Inserir 6 decisões alternadas dentro de OscillationWindow (3 pares = threshold*2).
	// Espaçadas de 60 minutos cada, todas dentro das últimas 24h.
	decisions := []string{"pause", "resume", "pause", "resume", "pause", "resume"}
	for i, d := range decisions {
		offsetMin := (len(decisions) - i) * 60
		_, err := db.ExecContext(ctx, `
			INSERT INTO jonfrey_decisions (automation_id, decision, reason, created_at)
			VALUES ($1, $2::jonfrey_decision_t, 'test_oscillation', now() - ($3 * interval '1 minute'))`,
			automationID, d, offsetMin,
		)
		if err != nil {
			t.Fatalf("insert decision[%d]=%s: %v", i, d, err)
		}
	}

	// countRecentFlips deve retornar >= OscillationThreshold*2.
	flips := countRecentFlips(ctx, db, automationID)
	if flips < OscillationThreshold*2 {
		t.Errorf("esperado countRecentFlips >= %d, got %d", OscillationThreshold*2, flips)
	}

	// CanDecide deve retornar oscillation_detected.
	allowed, reason := CanDecide(ctx, db, automationID, DecisionPause)
	if allowed {
		t.Error("esperado CanDecide=false quando oscillation_detected")
	}
	if reason != "oscillation_detected" {
		t.Errorf("esperado reason='oscillation_detected', got %q", reason)
	}

	// PauseAutomation deve invocar EscalateFunc.
	escalateCalled := false
	var escalatedAutomationID, escalatedReason string

	prev := escalateFn
	SetEscalateFunc(func(_ context.Context, aID string, r string) {
		escalateCalled = true
		escalatedAutomationID = aID
		escalatedReason = r
	})
	t.Cleanup(func() { SetEscalateFunc(prev) })

	if err := PauseAutomation(ctx, db, automationID, "test_trigger_oscillation"); err != nil {
		t.Fatalf("PauseAutomation: %v", err)
	}

	if !escalateCalled {
		t.Error("esperado EscalateFunc ser invocada quando oscillation_detected")
	}
	if escalatedAutomationID != automationID {
		t.Errorf("esperado escalatedAutomationID=%q, got %q", automationID, escalatedAutomationID)
	}
	if escalatedReason != "oscillation_detected" {
		t.Errorf("esperado escalatedReason='oscillation_detected', got %q", escalatedReason)
	}

	// Verificar que DecisionEscalateToHuman foi gravado em jonfrey_decisions.
	var count int
	if err := db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM jonfrey_decisions
		WHERE automation_id = $1 AND decision = 'escalate_to_human'`,
		automationID,
	); err != nil {
		t.Fatalf("verificar escalate_to_human em DB: %v", err)
	}
	if count == 0 {
		t.Error("esperado pelo menos 1 linha 'escalate_to_human' em jonfrey_decisions")
	}
}

// TestRegulateChannelBandit_ColdStart verifica que canal com < coldStartThreshold pulls não sofre ajuste.
// Cenário: canal sem row em channel_score_weights → RegulateChannelBandit retorna nil sem gravar tune.
func TestRegulateChannelBandit_ColdStart(t *testing.T) {
	db := testutil.MustPG(t)
	ctx := context.Background()

	// Canal inexistente → fetchChannelState retorna estado vazio (TotalPulls=0).
	const channelID = int64(999999997)

	if err := RegulateChannelBandit(ctx, db, channelID); err != nil {
		t.Fatalf("RegulateChannelBandit cold-start: %v", err)
	}

	// Nenhuma decisão tune deve ter sido gravada.
	var count int
	if err := db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM jonfrey_decisions
		WHERE automation_id = 'tune_bandit_exploration'
		  AND payload->>'channel_id' = $1`,
		fmt.Sprintf("%d", channelID),
	); err != nil {
		t.Fatalf("verificar jonfrey_decisions cold-start: %v", err)
	}
	if count > 0 {
		t.Errorf("esperado 0 decisões tune em cold-start, got %d", count)
	}
}

// TestAntiLoopGuard_CriticalNotPaused verifica invariante I10: automations 'critical' nunca são pausadas.
// PauseAutomation deve retornar sem error mas sem alterar enabled (applyPause filtra kind='elective').
func TestAntiLoopGuard_CriticalNotPaused(t *testing.T) {
	db := testutil.MustPG(t)
	ctx := context.Background()

	automationID := fmt.Sprintf("test_critical_%d", time.Now().UnixNano())

	// Seed automation critical.
	_, err := db.ExecContext(ctx, `
		INSERT INTO automations (id, kind, enabled, controlled_by_jonfrey)
		VALUES ($1, 'critical', TRUE, FALSE)`,
		automationID,
	)
	if err != nil {
		t.Fatalf("seed critical automation: %v", err)
	}

	// PauseAutomation deve ser no-op para critical.
	if err := PauseAutomation(ctx, db, automationID, "test_critical_attempt"); err != nil {
		t.Fatalf("PauseAutomation critical: %v", err)
	}

	// Automation deve continuar enabled=TRUE.
	var enabled bool
	if err := db.GetContext(ctx, &enabled, `SELECT enabled FROM automations WHERE id = $1`, automationID); err != nil {
		t.Fatalf("verificar enabled: %v", err)
	}
	if !enabled {
		t.Error("automation critical não deve ser desabilitada por PauseAutomation (invariante I10 violada)")
	}

	// Nenhuma decisão deve ter sido gravada em jonfrey_decisions.
	var count int
	if err := db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM jonfrey_decisions WHERE automation_id = $1`,
		automationID,
	); err != nil {
		t.Fatalf("verificar jonfrey_decisions: %v", err)
	}
	if count > 0 {
		t.Errorf("esperado 0 decisões para critical skip (I10), got %d", count)
	}
}
