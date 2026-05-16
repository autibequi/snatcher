package algo

import (
	"context"
	"encoding/json"
	"math"

	"github.com/jmoiron/sqlx"
)

// ArmID identifica um braço do bandit.
type ArmID string

// Arm representa um braço UCB1 com pesos e estatísticas acumuladas.
type Arm struct {
	ID      ArmID          `json:"id"`
	Weights ChannelWeights `json:"weights"`
	Pulls   int            `json:"pulls"`
	Reward  float64        `json:"reward"`
}

// ChannelWeights contém os multiplicadores por dimensão usados em ComputeScoreV2.
type ChannelWeights struct {
	Discount    float64 `json:"discount"`
	Freshness   float64 `json:"freshness"`
	SourceTrust float64 `json:"source_trust"`
}

// ContextualBandit gerencia os braços UCB1 de um canal específico.
type ContextualBandit struct {
	ChannelID int64
	Arms      []Arm
}

// LoadBandit carrega o estado UCB1 do banco para o canal dado.
// Em caso de erro ou estado inválido, retorna bandit com defaultSafeArms (cold-start).
func LoadBandit(ctx context.Context, db *sqlx.DB, channelID int64) (*ContextualBandit, error) {
	var ucb1State string
	err := db.GetContext(ctx, &ucb1State,
		`SELECT ucb1_state::text FROM channel_score_weights WHERE channel_id = $1`, channelID)
	if err != nil {
		return &ContextualBandit{ChannelID: channelID, Arms: defaultSafeArms()}, nil
	}
	var arms []Arm
	if err := json.Unmarshal([]byte(ucb1State), &arms); err != nil || len(arms) == 0 {
		arms = defaultSafeArms()
	}
	return &ContextualBandit{ChannelID: channelID, Arms: arms}, nil
}

// Pick aplica UCB1: arm_score = avg_reward + exploration * sqrt(2 ln(total_pulls) / arm_pulls).
// Cold-start: se total_pulls < 100, retorna o braço "safe" (alto source_trust + freshness).
func (b *ContextualBandit) Pick(exploration float64) ArmID {
	total := 0
	for _, a := range b.Arms {
		total += a.Pulls
	}
	if total < 100 {
		return defaultSafeArm().ID
	}
	var bestID ArmID
	var bestScore float64 = -1
	for _, a := range b.Arms {
		if a.Pulls == 0 {
			return a.ID // explorar braços novos primeiro
		}
		avg := a.Reward / float64(a.Pulls)
		ucb := avg + exploration*math.Sqrt(2*math.Log(float64(total))/float64(a.Pulls))
		if ucb > bestScore {
			bestScore = ucb
			bestID = a.ID
		}
	}
	return bestID
}

// Update registra o reward observado para o braço identificado por armID.
func (b *ContextualBandit) Update(armID ArmID, reward float64) {
	for i := range b.Arms {
		if b.Arms[i].ID == armID {
			b.Arms[i].Pulls++
			b.Arms[i].Reward += reward
			return
		}
	}
}

// Persist salva o estado UCB1 no banco, fazendo upsert em channel_score_weights
// e inserindo uma entrada em channel_score_weights_history para auditoria.
func (b *ContextualBandit) Persist(ctx context.Context, db *sqlx.DB, reason string) error {
	raw, err := json.Marshal(b.Arms)
	if err != nil {
		return err
	}
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	_, err = tx.ExecContext(ctx, `
		INSERT INTO channel_score_weights (channel_id, ucb1_state, updated_by)
		VALUES ($1, $2::jsonb, $3)
		ON CONFLICT (channel_id) DO UPDATE
		SET ucb1_state = EXCLUDED.ucb1_state,
		    updated_at = now(),
		    updated_by = EXCLUDED.updated_by`,
		b.ChannelID, string(raw), reason)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO channel_score_weights_history (channel_id, weights, ucb1_state, reason)
		VALUES ($1, '{}'::jsonb, $2::jsonb, $3)`,
		b.ChannelID, string(raw), reason)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func defaultSafeArms() []Arm {
	return []Arm{
		defaultSafeArm(),
		{ID: "explorer", Weights: ChannelWeights{Discount: 0.5, Freshness: 0.3, SourceTrust: 0.2}},
		{ID: "balanced", Weights: ChannelWeights{Discount: 0.4, Freshness: 0.3, SourceTrust: 0.3}},
	}
}

func defaultSafeArm() Arm {
	// Alto source_trust + freshness = "safe" para canais cold-start.
	return Arm{ID: "safe", Weights: ChannelWeights{Discount: 0.3, Freshness: 0.4, SourceTrust: 0.3}}
}
