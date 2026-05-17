package repositories

import (
	"context"

	"github.com/jmoiron/sqlx"
)

// TunableParam é a representação de uma linha em tunable_parameters
// exposta pelo handler admin.
type TunableParam struct {
	ID           int64   `db:"id" json:"id"`
	ScopeType    string  `db:"scope_type" json:"scope_type"`
	ScopeID      *int64  `db:"scope_id" json:"scope_id,omitempty"`
	ParamName    string  `db:"param_name" json:"param_name"`
	CurrentValue float64 `db:"current_value" json:"current_value"`
	DefaultValue float64 `db:"default_value" json:"default_value"`
	MinValue     float64 `db:"min_value" json:"min_value"`
	MaxValue     float64 `db:"max_value" json:"max_value"`
	LastChanged  *string `db:"last_changed" json:"last_changed,omitempty"`
	LastChangeBy *string `db:"last_change_by" json:"last_change_by,omitempty"`
}

// TunableParamsRepo encapsula CRUD da tabela tunable_parameters.
// Existe pra tirar SQL direto do handler admin (boundary handler → repo).
type TunableParamsRepo struct {
	DB *sqlx.DB
}

func NewTunableParamsRepo(db *sqlx.DB) *TunableParamsRepo {
	return &TunableParamsRepo{DB: db}
}

// List retorna todos os parâmetros tunáveis ordenados por scope/name.
func (r *TunableParamsRepo) List(ctx context.Context) ([]TunableParam, error) {
	var rows []TunableParam
	err := r.DB.SelectContext(ctx, &rows, `
		SELECT id, scope_type, scope_id, param_name, current_value, default_value,
		       min_value, max_value, last_changed::text, last_change_by
		FROM tunable_parameters
		ORDER BY scope_type, scope_id NULLS FIRST, param_name
	`)
	return rows, err
}

// GetBounds devolve min/max — usado pra validar input antes de Update.
// Retorna sql.ErrNoRows se id inexistente.
func (r *TunableParamsRepo) GetBounds(ctx context.Context, id int64) (minVal, maxVal float64, err error) {
	err = r.DB.QueryRowxContext(ctx,
		"SELECT min_value, max_value FROM tunable_parameters WHERE id=$1", id,
	).Scan(&minVal, &maxVal)
	return
}

// Update grava current_value + audita autor.
func (r *TunableParamsRepo) Update(ctx context.Context, id int64, value float64, changeBy string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tunable_parameters
		SET current_value=$1, last_changed=now(), last_change_by=$2
		WHERE id=$3
	`, value, changeBy, id)
	return err
}

// Reset volta current_value para default_value.
func (r *TunableParamsRepo) Reset(ctx context.Context, id int64, changeBy string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tunable_parameters
		SET current_value=default_value, last_changed=now(), last_change_by=$1
		WHERE id=$2
	`, changeBy, id)
	return err
}
