package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

// BanditState é uma linha de channel_score_weights para o admin.
// Campos vêm com cast::text para evitar surpresa de JSON binário no decode.
type BanditState struct {
	ChannelID int64  `db:"channel_id"  json:"channel_id"`
	Weights   string `db:"weights"     json:"weights"`
	UCB1State string `db:"ucb1_state"  json:"ucb1_state"`
	UpdatedAt string `db:"updated_at"  json:"updated_at"`
	UpdatedBy string `db:"updated_by"  json:"updated_by"`
}

// BanditRepo isola SQL de channel_score_weights da camada handler.
type BanditRepo struct {
	DB *sqlx.DB
}

func NewBanditRepo(db *sqlx.DB) *BanditRepo {
	return &BanditRepo{DB: db}
}

// Get devolve o estado bandit de um canal.
// (nil, nil) quando não há row (canal ainda não estreou no bandit).
func (r *BanditRepo) Get(ctx context.Context, channelID int64) (*BanditState, error) {
	var row BanditState
	err := r.DB.GetContext(ctx, &row, `
		SELECT channel_id,
		       COALESCE(weights::text, '{}') AS weights,
		       COALESCE(ucb1_state::text, '[]') AS ucb1_state,
		       COALESCE(updated_at::text, '') AS updated_at,
		       COALESCE(updated_by, '') AS updated_by
		FROM channel_score_weights
		WHERE channel_id = $1
	`, channelID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &row, err
}

// Reset apaga a row — próxima leitura via LoadBandit recria com defaultSafeArms.
func (r *BanditRepo) Reset(ctx context.Context, channelID int64) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM channel_score_weights WHERE channel_id = $1`, channelID)
	return err
}
