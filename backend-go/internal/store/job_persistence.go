package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/jobs"
)

// JobPersistence implementa jobs.Persistence (fila persistida em background_jobs).
type JobPersistence struct {
	db *sqlx.DB
}

// NewJobPersistence constrói persistência de jobs para uso com jobs.Manager.
func NewJobPersistence(db *sqlx.DB) *JobPersistence {
	return &JobPersistence{db: db}
}

type backgroundJobRow struct {
	ID           string         `db:"id"`
	Kind         string         `db:"kind"`
	Name         string         `db:"name"`
	Status       string         `db:"status"`
	StartedAt    time.Time      `db:"started_at"`
	CompletedAt  sql.NullTime   `db:"completed_at"`
	Progress     int            `db:"progress"`
	Total        int            `db:"total"`
	Done         int            `db:"done"`
	Message      sql.NullString `db:"message"`
	ErrorMessage sql.NullString `db:"error_message"`
	ActivityJSON []byte         `db:"activity_json"`
}

func rowToJob(r backgroundJobRow) (*jobs.Job, error) {
	j := &jobs.Job{
		ID:        r.ID,
		Kind:      r.Kind,
		Name:      r.Name,
		Status:    jobs.Status(r.Status),
		StartedAt: r.StartedAt,
		Progress:  r.Progress,
		Total:     r.Total,
		Done:      r.Done,
	}
	if r.CompletedAt.Valid {
		t := r.CompletedAt.Time
		j.CompletedAt = &t
	}
	if r.Message.Valid {
		j.Message = r.Message.String
	}
	if r.ErrorMessage.Valid {
		j.Error = r.ErrorMessage.String
	}
	if len(r.ActivityJSON) > 0 {
		if err := json.Unmarshal(r.ActivityJSON, &j.Activity); err != nil {
			return nil, fmt.Errorf("activity_json: %w", err)
		}
	}
	return j, nil
}

// UpsertRunning insere um job recém-criado (status running).
func (p *JobPersistence) UpsertRunning(j *jobs.Job) error {
	act, err := json.Marshal(j.Activity)
	if err != nil {
		return err
	}
	var completed interface{}
	if j.CompletedAt != nil {
		completed = *j.CompletedAt
	}
	_, err = p.db.Exec(`
		INSERT INTO background_jobs (id, kind, name, status, started_at, completed_at, progress, total, done, message, error_message, activity_json, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb, now())`,
		j.ID, j.Kind, j.Name, string(j.Status), j.StartedAt, completed, j.Progress, j.Total, j.Done,
		nullIfEmpty(j.Message), nullIfEmpty(j.Error), act,
	)
	return err
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// SyncFromJob grava progresso, mensagem e activity atuais (memória é fonte da verdade durante execução).
func (p *JobPersistence) SyncFromJob(j *jobs.Job) error {
	act, err := json.Marshal(j.Activity)
	if err != nil {
		return err
	}
	_, err = p.db.Exec(`
		UPDATE background_jobs SET
			progress = $1, total = $2, done = $3, message = $4,
			activity_json = $5::jsonb, updated_at = now()
		WHERE id = $6`,
		j.Progress, j.Total, j.Done, nullIfEmpty(j.Message), act, j.ID,
	)
	return err
}

// SetTerminal persiste estado final (completed / failed / cancelled).
func (p *JobPersistence) SetTerminal(j *jobs.Job) error {
	var completed interface{}
	if j.CompletedAt != nil {
		completed = *j.CompletedAt
	} else {
		completed = time.Now()
	}
	act, err := json.Marshal(j.Activity)
	if err != nil {
		return err
	}
	_, err = p.db.Exec(`
		UPDATE background_jobs SET
			status = $1,
			completed_at = $2,
			message = $3,
			error_message = $4,
			progress = $5,
			total = $6,
			done = $7,
			activity_json = $8::jsonb,
			updated_at = now()
		WHERE id = $9`,
		string(j.Status), completed,
		nullIfEmpty(j.Message), nullIfEmpty(j.Error),
		j.Progress, j.Total, j.Done, act, j.ID,
	)
	return err
}

// ListFIFO retorna jobs running ou terminal recente, ordenados por started_at ASC (frente da fila = mais antigo ativo).
func (p *JobPersistence) ListFIFO(limit int, terminalMaxAgeDays int) ([]*jobs.Job, error) {
	if limit <= 0 {
		limit = 150
	}
	if terminalMaxAgeDays <= 0 {
		terminalMaxAgeDays = 30
	}
	q := `
		SELECT id, kind, name, status, started_at, completed_at, progress, total, done, message, error_message, activity_json
		FROM background_jobs
		WHERE status = 'running'
		   OR (completed_at IS NOT NULL AND completed_at > CURRENT_TIMESTAMP - ($1::bigint * INTERVAL '1 day'))
		ORDER BY started_at ASC
		LIMIT $2`
	var rows []backgroundJobRow
	if err := p.db.Select(&rows, q, terminalMaxAgeDays, limit); err != nil {
		return nil, err
	}
	out := make([]*jobs.Job, 0, len(rows))
	for _, r := range rows {
		j, err := rowToJob(r)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, nil
}

// DeleteTerminalJobs remove linhas finalizadas da tabela (limpar UI / histórico curto).
func (p *JobPersistence) DeleteTerminalJobs() (int, error) {
	res, err := p.db.Exec(`
		DELETE FROM background_jobs
		WHERE status IN ('completed', 'failed', 'cancelled')`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// FailStaleRunning marca running antigos como failed (crash / timeout).
func (p *JobPersistence) FailStaleRunning(maxAge time.Duration) (int, error) {
	msg := fmt.Sprintf("timeout da fila: running há mais de %v sem finalizar", maxAge)
	sec := int(maxAge.Seconds())
	if sec < 1 {
		sec = 1
	}
	res, err := p.db.Exec(`
		UPDATE background_jobs SET
			status = 'failed',
			completed_at = now(),
			error_message = $1,
			updated_at = now()
		WHERE status = 'running' AND started_at < now() - ($2::bigint * interval '1 second')`,
		msg, sec,
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// MarkOrphanRunningAsFailed marca todos os running como failed (ex.: após restart do processo).
func (p *JobPersistence) MarkOrphanRunningAsFailed(msg string) (int, error) {
	res, err := p.db.Exec(`
		UPDATE background_jobs SET
			status = 'failed',
			completed_at = COALESCE(completed_at, now()),
			error_message = $1,
			updated_at = now()
		WHERE status = 'running'`,
		msg,
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// HasRunningName indica se já existe job running com o mesmo name (dedup).
func (p *JobPersistence) HasRunningName(name string) (bool, error) {
	var ok bool
	err := p.db.Get(&ok, `SELECT EXISTS(SELECT 1 FROM background_jobs WHERE name = $1 AND status = 'running')`, name)
	if err != nil {
		return false, err
	}
	return ok, nil
}
