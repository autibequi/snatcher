// Package jobs provê um gerenciador in-memory de jobs em background
// para visualização/cancelamento via API.
package jobs

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

type Status string

const (
	StatusRunning   Status = "running"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
)

type Job struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Status      Status     `json:"status"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Progress    int        `json:"progress"` // 0-100
	Total       int        `json:"total,omitempty"`
	Done        int        `json:"done,omitempty"`
	Message     string     `json:"message,omitempty"`
	Error       string     `json:"error,omitempty"`

	cancel context.CancelFunc `json:"-"`
}

type Manager struct {
	mu     sync.RWMutex
	jobs   map[string]*Job
	nextID atomic.Uint64
}

var defaultManager = &Manager{jobs: map[string]*Job{}}

// Default retorna o manager singleton do processo.
func Default() *Manager { return defaultManager }

// Start cria e registra um novo job, retornando o Job e um context cancelável.
// O caller deve chamar Done() ou Fail() ao terminar.
func (m *Manager) Start(parentCtx context.Context, name string) (*Job, context.Context) {
	m.nextID.Add(1)
	id := fmt.Sprintf("job-%d-%d", time.Now().Unix(), m.nextID.Load())
	ctx, cancel := context.WithCancel(parentCtx)
	job := &Job{
		ID:        id,
		Name:      name,
		Status:    StatusRunning,
		StartedAt: time.Now(),
		cancel:    cancel,
	}
	m.mu.Lock()
	m.jobs[id] = job
	m.mu.Unlock()
	return job, ctx
}

// Update atualiza progresso/mensagem do job.
func (m *Manager) Update(id string, done, total int, msg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[id]; ok {
		j.Done = done
		j.Total = total
		if total > 0 {
			j.Progress = (done * 100) / total
		}
		if msg != "" {
			j.Message = msg
		}
	}
}

// Done marca o job como completado.
func (m *Manager) Done(id, msg string) {
	m.finish(id, StatusCompleted, msg, "")
}

// Fail marca o job como falhado.
func (m *Manager) Fail(id, errMsg string) {
	m.finish(id, StatusFailed, "", errMsg)
}

func (m *Manager) finish(id string, status Status, msg, errMsg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[id]; ok {
		now := time.Now()
		j.Status = status
		j.CompletedAt = &now
		if msg != "" {
			j.Message = msg
		}
		if errMsg != "" {
			j.Error = errMsg
		}
		if j.Progress < 100 && status == StatusCompleted {
			j.Progress = 100
		}
	}
}

// Cancel cancela um job em execução.
func (m *Manager) Cancel(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.jobs[id]
	if !ok || j.Status != StatusRunning {
		return false
	}
	if j.cancel != nil {
		j.cancel()
	}
	now := time.Now()
	j.Status = StatusCancelled
	j.CompletedAt = &now
	return true
}

// List retorna jobs ordenados por StartedAt DESC. Mantém apenas os 100 mais recentes.
func (m *Manager) List() []*Job {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Job, 0, len(m.jobs))
	for _, j := range m.jobs {
		out = append(out, j)
	}
	// sort por StartedAt desc
	for i := 0; i < len(out); i++ {
		for k := i + 1; k < len(out); k++ {
			if out[k].StartedAt.After(out[i].StartedAt) {
				out[i], out[k] = out[k], out[i]
			}
		}
	}
	if len(out) > 100 {
		out = out[:100]
	}
	return out
}

// Clear remove jobs concluídos/falhados/cancelados (mantém apenas running).
func (m *Manager) Clear() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	removed := 0
	for id, j := range m.jobs {
		if j.Status != StatusRunning {
			delete(m.jobs, id)
			removed++
		}
	}
	return removed
}

// CancelAll cancela todos os jobs em execução.
func (m *Manager) CancelAll() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	cancelled := 0
	for _, j := range m.jobs {
		if j.Status == StatusRunning && j.cancel != nil {
			j.cancel()
			now := time.Now()
			j.Status = StatusCancelled
			j.CompletedAt = &now
			cancelled++
		}
	}
	return cancelled
}

// HasRunning retorna true se há algum job rodando com o nome dado (pra dedup).
func (m *Manager) HasRunning(name string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, j := range m.jobs {
		if j.Status == StatusRunning && j.Name == name {
			return true
		}
	}
	return false
}
