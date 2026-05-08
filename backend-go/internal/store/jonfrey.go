package store

import (
	"snatcher/backendv2/internal/models"
)

// CreateJonfreyAction insere uma nova ação no audit log.
func (s *SQLStore) CreateJonfreyAction(a models.JonfreyAction) (int64, error) {
	if a.Status == "" {
		a.Status = "pending"
	}
	if a.TriggeredBy == "" {
		a.TriggeredBy = "manual"
	}
	if len(a.BeforeSnapshot) == 0 {
		a.BeforeSnapshot = []byte("{}")
	}
	if len(a.AfterSnapshot) == 0 {
		a.AfterSnapshot = []byte("{}")
	}
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO jonfrey_actions
		  (action_type, target, status, reasoning, before_snapshot, after_snapshot, triggered_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`,
		a.ActionType, a.Target, a.Status, a.Reasoning,
		a.BeforeSnapshot, a.AfterSnapshot, a.TriggeredBy,
	).Scan(&id)
	return id, err
}

// UpdateJonfreyAction atualiza status, reasoning, after_snapshot, error_message e finished_at.
func (s *SQLStore) UpdateJonfreyAction(a models.JonfreyAction) error {
	_, err := s.db.NamedExec(`
		UPDATE jonfrey_actions SET
		  status = :status,
		  reasoning = :reasoning,
		  after_snapshot = :after_snapshot,
		  error_message = :error_message,
		  finished_at = :finished_at
		WHERE id = :id`, a)
	return err
}

// ListJonfreyActions retorna últimas N ações, opcionalmente filtradas por tipo.
func (s *SQLStore) ListJonfreyActions(limit int, actionType string) ([]models.JonfreyAction, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := `
		SELECT id, action_type, target, status, reasoning,
		       before_snapshot, after_snapshot, error_message,
		       triggered_by, created_at, finished_at
		FROM jonfrey_actions
		WHERE ($1 = '' OR action_type = $1)
		ORDER BY created_at DESC
		LIMIT $2`
	var out []models.JonfreyAction
	err := s.db.Select(&out, q, actionType, limit)
	return out, err
}

// GetJonfreyConfig retorna a config singleton (id=1).
func (s *SQLStore) GetJonfreyConfig() (models.JonfreyConfig, error) {
	var c models.JonfreyConfig
	err := s.db.Get(&c, `
		SELECT id, enabled, interval_minutes, enabled_actions, last_run_at, updated_at
		FROM jonfrey_config WHERE id = 1`)
	return c, err
}

// UpdateJonfreyConfig atualiza a config singleton.
func (s *SQLStore) UpdateJonfreyConfig(c models.JonfreyConfig) error {
	_, err := s.db.Exec(`
		UPDATE jonfrey_config SET
		  enabled = $1,
		  interval_minutes = $2,
		  enabled_actions = $3,
		  last_run_at = $4,
		  updated_at = now()
		WHERE id = 1`,
		c.Enabled, c.IntervalMinutes, c.EnabledActions, c.LastRunAt,
	)
	return err
}
