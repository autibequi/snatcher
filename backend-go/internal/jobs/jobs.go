// Package jobs provê um gerenciador in-memory de jobs em background
// para visualização/cancelamento via API.
package jobs

import (
	"context"
	"fmt"
	"sort"
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

const maxActivityLines = 120

// JobActivity linha de log append-only para UI da fila.
type JobActivity struct {
	At      time.Time `json:"at"`
	Message string    `json:"message"`
}

type Job struct {
	ID          string     `json:"id"`
	Kind        string     `json:"kind"` // jonfrey | pipeline | curation | search_terms | …
	Name        string     `json:"name"`
	Status      Status     `json:"status"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Progress    int        `json:"progress"` // 0-100
	Total       int        `json:"total,omitempty"`
	Done        int        `json:"done,omitempty"`
	Message     string     `json:"message,omitempty"`
	Error       string     `json:"error,omitempty"`
	Activity    []JobActivity `json:"activity,omitempty"`

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
	return m.StartKind(parentCtx, "task", name)
}

// StartKind igual a Start mas com Kind para agrupar na UI (ex.: jonfrey, pipeline).
func (m *Manager) StartKind(parentCtx context.Context, kind, name string) (*Job, context.Context) {
	if kind == "" {
		kind = "task"
	}
	m.nextID.Add(1)
	id := fmt.Sprintf("job-%d-%d", time.Now().Unix(), m.nextID.Load())
	ctx, cancel := context.WithCancel(parentCtx)
	job := &Job{
		ID:        id,
		Kind:      kind,
		Name:      name,
		Status:    StatusRunning,
		StartedAt: time.Now(),
		cancel:    cancel,
	}
	m.mu.Lock()
	m.jobs[id] = job
	m.mu.Unlock()
	m.AppendActivity(id, "job iniciado")
	return job, ctx
}

// AppendActivity adiciona linha ao histórico do job (cap maxActivityLines).
func (m *Manager) AppendActivity(id, msg string) {
	if msg == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.jobs[id]
	if !ok || j.Status != StatusRunning {
		return
	}
	j.Activity = append(j.Activity, JobActivity{At: time.Now(), Message: msg})
	if len(j.Activity) > maxActivityLines {
		j.Activity = j.Activity[len(j.Activity)-maxActivityLines:]
	}
}

// ReconcileStaleRunning marca jobs running há mais de maxAge como failed (processo morto / leak).
func (m *Manager) ReconcileStaleRunning(maxAge time.Duration) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	fixed := 0
	for _, j := range m.jobs {
		if j.Status != StatusRunning {
			continue
		}
		if now.Sub(j.StartedAt) < maxAge {
			continue
		}
		t := now
		j.Status = StatusFailed
		j.CompletedAt = &t
		j.Error = fmt.Sprintf("timeout da fila: running há mais de %v sem finalizar (servidor reiniciou ou goroutine presa)", maxAge)
		if j.Message == "" {
			j.Message = j.Error
		}
		if j.cancel != nil {
			j.cancel()
		}
		fixed++
	}
	return fixed
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

// List retorna jobs ordenados por StartedAt DESC (mais recentes primeiro).
func (m *Manager) List() []*Job {
	return m.listSorted(true)
}

// ListFIFO retorna jobs ordenados por StartedAt ASC — frente da fila = mais antigo ainda ativo.
func (m *Manager) ListFIFO() []*Job {
	return m.listSorted(false)
}

func (m *Manager) listSorted(desc bool) []*Job {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Job, 0, len(m.jobs))
	for _, j := range m.jobs {
		out = append(out, j)
	}
	sort.Slice(out, func(i, j int) bool {
		if desc {
			return out[i].StartedAt.After(out[j].StartedAt)
		}
		return out[i].StartedAt.Before(out[j].StartedAt)
	})
	if desc && len(out) > 150 {
		out = out[:150]
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
