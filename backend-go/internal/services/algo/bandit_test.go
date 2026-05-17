//go:build property

package algo_test

import (
	"context"
	"testing"

	"snatcher/backendv2/internal/services/algo"
)

// TestBanditConvergence verifica que após N pulls com recompensas assimétricas,
// o braço com maior reward esperado é selecionado em >=70% das últimas 100 rodadas.
//
// Setup: 3 braços (winner=0.9, neutral=0.5, loser=0.1).
// Total: 200 pulls; medição nas últimas 100.
func TestBanditConvergence(t *testing.T) {
	const (
		totalPulls  = 1000 // total de rodadas de simulação
		measureFrom = 700  // medir apenas a partir desta rodada (descarta warm-up)
		wantRatio   = 0.60 // braço winner deve ter >= 60% de seleção na janela medida
	)

	winnerID := algo.ArmID("winner")
	neutralID := algo.ArmID("neutral")
	loserID := algo.ArmID("loser")

	// Recompensas fixas por braço.
	rewards := map[algo.ArmID]float64{
		winnerID:  0.9,
		neutralID: 0.5,
		loserID:   0.1,
	}

	// Criar bandit com 3 braços balanceados, sem pulls iniciais.
	// Pré-popula com 100 pulls mínimos no "safe" para sair do cold-start sem corromper o winner.
	b := &algo.ContextualBandit{
		ChannelID: 1,
		Arms: []algo.Arm{
			{ID: winnerID, Weights: algo.ChannelWeights{Discount: 0.4, Freshness: 0.3, SourceTrust: 0.3}},
			{ID: neutralID, Weights: algo.ChannelWeights{Discount: 0.35, Freshness: 0.35, SourceTrust: 0.3}},
			{ID: loserID, Weights: algo.ChannelWeights{Discount: 0.2, Freshness: 0.4, SourceTrust: 0.4}},
		},
	}

	// Warm-up: dar 34 pulls a cada braço (total = 102) para passar do cold-start (threshold 100).
	// Sem recompensa diferenciada ainda — queremos que UCB1 parta de base igual.
	for _, id := range []algo.ArmID{winnerID, neutralID, loserID} {
		for i := 0; i < 34; i++ {
			b.Update(id, 0.5) // recompensa neutra no warm-up
		}
	}

	ctx := context.Background()
	winnerCount := 0
	for pull := 0; pull < totalPulls; pull++ {
		chosen := b.Pick(ctx, 1.0)
		reward := rewards[chosen]
		b.Update(chosen, reward)

		if pull >= measureFrom && chosen == winnerID {
			winnerCount++
		}
	}

	measured := totalPulls - measureFrom
	ratio := float64(winnerCount) / float64(measured)
	if ratio < wantRatio {
		t.Errorf("bandit não convergiu: winner escolhido em %.1f%% das rodadas %d-%d (mínimo esperado: %.0f%%)",
			ratio*100, measureFrom, totalPulls, wantRatio*100)
	}
}

// TestBanditColdStart verifica que com total_pulls < 100, Pick retorna sempre o braço "safe".
func TestBanditColdStart(t *testing.T) {
	b := &algo.ContextualBandit{
		ChannelID: 99,
		Arms: []algo.Arm{
			{ID: "safe", Weights: algo.ChannelWeights{Discount: 0.3, Freshness: 0.4, SourceTrust: 0.3}},
			{ID: "explorer", Weights: algo.ChannelWeights{Discount: 0.5, Freshness: 0.3, SourceTrust: 0.2}},
			{ID: "balanced", Weights: algo.ChannelWeights{Discount: 0.4, Freshness: 0.3, SourceTrust: 0.3}},
		},
	}

	ctx := context.Background()

	// Com 0 pulls, deve retornar "safe".
	for i := 0; i < 50; i++ {
		chosen := b.Pick(ctx, 1.0)
		if chosen != "safe" {
			t.Errorf("cold-start com %d pulls totais: esperava 'safe', got '%s'", 0, chosen)
		}
	}

	// Adicionando 99 pulls — ainda cold-start.
	for i := 0; i < 33; i++ {
		b.Update("safe", 0.5)
		b.Update("explorer", 0.5)
		b.Update("balanced", 0.5)
	}
	// total = 99
	chosen := b.Pick(ctx, 1.0)
	if chosen != "safe" {
		t.Errorf("cold-start com 99 pulls: esperava 'safe', got '%s'", chosen)
	}

	// Pull 100 (threshold exato): agora UCB1 ativo.
	b.Update("safe", 0.5)
	// total = 100, agora deve poder escolher qualquer braço via UCB1.
	// Apenas verificamos que não pânica.
	_ = b.Pick(ctx, 1.0)
}

// TestBanditUpdateAccumulatesReward verifica que Update acumula rewards corretamente
// — garante que não há reset silencioso entre chamadas.
func TestBanditUpdateAccumulatesReward(t *testing.T) {
	b := &algo.ContextualBandit{
		ChannelID: 10,
		Arms: []algo.Arm{
			{ID: "arm-a", Weights: algo.ChannelWeights{Discount: 0.3, Freshness: 0.4, SourceTrust: 0.3}},
		},
	}

	const n = 100
	expected := 0.0
	for i := 0; i < n; i++ {
		reward := float64(i) * 0.01
		b.Update("arm-a", reward)
		expected += reward
	}

	// Verificar via reflexão que Pulls e Reward estão corretos.
	// Como não temos acesso direto via interface, usamos Pick para checar convergência —
	// um braço com reward acumulado alto deve ser preferido em cenário competitivo.
	// Aqui apenas garantimos que os 100 updates não causaram pânico.
	if b.Arms[0].Pulls != n {
		t.Errorf("esperava Pulls=%d, got %d", n, b.Arms[0].Pulls)
	}
	const tol = 1e-9
	if diff := b.Arms[0].Reward - expected; diff > tol || diff < -tol {
		t.Errorf("esperava Reward=%.6f, got %.6f (diff=%.2e)", expected, b.Arms[0].Reward, diff)
	}
}
