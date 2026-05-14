package jobs

import "time"

// Persistence opcional: persiste a fila em PostgreSQL (tabela background_jobs) para sobreviver a restart.
type Persistence interface {
	UpsertRunning(j *Job) error
	SyncFromJob(j *Job) error
	SetTerminal(j *Job) error
	ListFIFO(limit int, terminalMaxAgeDays int) ([]*Job, error)
	DeleteTerminalJobs() (int, error)
	FailStaleRunning(maxAge time.Duration) (int, error)
	MarkOrphanRunningAsFailed(msg string) (int, error)
	HasRunningName(name string) (bool, error)
}
