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

// UpdateJonfreyAction atualiza status, reasoning, snapshots, error_message e finished_at.
func (s *SQLStore) UpdateJonfreyAction(a models.JonfreyAction) error {
	_, err := s.db.NamedExec(`
		UPDATE jonfrey_actions SET
		  status = :status,
		  reasoning = :reasoning,
		  before_snapshot = :before_snapshot,
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

// ListJonfreyActionsForWorkQueue retorna ações para timeline da fila: todas em running + terminal recente.
// Importante: não usar um único ORDER BY created_at ASC + LIMIT — com muitas linhas antigas no período de 72h,
// as ações running mais recentes ficavam fora da janela e sumiam da barra ⏱.
func (s *SQLStore) ListJonfreyActionsForWorkQueue(limit int) ([]models.JonfreyAction, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	const sel = `
		SELECT id, action_type, target, status, reasoning,
		       before_snapshot, after_snapshot, error_message,
		       triggered_by, created_at, finished_at
		FROM jonfrey_actions`
	var running []models.JonfreyAction
	if err := s.db.Select(&running, sel+`
		WHERE status = 'running'
		ORDER BY created_at ASC`); err != nil {
		return nil, err
	}
	var recent []models.JonfreyAction
	if err := s.db.Select(&recent, sel+`
		WHERE status <> 'running'
		  AND finished_at IS NOT NULL
		  AND finished_at > now() - interval '72 hours'
		ORDER BY finished_at DESC
		LIMIT $1`, limit); err != nil {
		return nil, err
	}
	seen := make(map[int64]struct{}, len(running)+len(recent))
	out := make([]models.JonfreyAction, 0, len(running)+len(recent))
	for _, a := range running {
		if _, ok := seen[a.ID]; ok {
			continue
		}
		seen[a.ID] = struct{}{}
		out = append(out, a)
	}
	for _, a := range recent {
		if _, ok := seen[a.ID]; ok {
			continue
		}
		seen[a.ID] = struct{}{}
		out = append(out, a)
	}
	return out, nil
}

// ReconcileStaleJonfreyActions marca running antigos como failed (crash / timeout / restart).
func (s *SQLStore) ReconcileStaleJonfreyActions(staleMinutes int, message string) (int64, error) {
	if staleMinutes <= 0 {
		staleMinutes = 20
	}
	if message == "" {
		message = "encerrado como falha: execução não finalizou a tempo ou o servidor reiniciou."
	}
	res, err := s.db.Exec(`
		UPDATE jonfrey_actions
		SET status = 'failed',
		    error_message = $1,
		    finished_at = NOW()
		WHERE status = 'running'
		  AND created_at < NOW() - ($2::bigint * INTERVAL '1 minute')`,
		message, staleMinutes,
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
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
