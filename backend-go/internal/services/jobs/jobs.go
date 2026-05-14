// Package jobs provê um gerenciador de jobs em background com persistência opcional em PostgreSQL.
package jobs

import (
	"context"
	"fmt"
	"log/slog"
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

const defaultTerminalListDays = 30

// JobActivity linha de log append-only para UI da fila.
type JobActivity struct {
	At      time.Time `json:"at"`
	Message string    `json:"message"`
}

type Job struct {
	ID          string        `json:"id"`
	Kind        string        `json:"kind"` // jonfrey | pipeline | curation | search_terms | …
	Name        string        `json:"name"`
	Status      Status        `json:"status"`
	StartedAt   time.Time     `json:"started_at"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	Progress    int           `json:"progress"` // 0-100
	Total       int           `json:"total,omitempty"`
	Done        int           `json:"done,omitempty"`
	Message     string        `json:"message,omitempty"`
	Error       string        `json:"error,omitempty"`
	Activity    []JobActivity `json:"activity,omitempty"`

	cancel context.CancelFunc `json:"-"`
}

type Manager struct {
	mu        sync.RWMutex
	jobs      map[string]*Job // só jobs running neste processo (cancel); com persistence, terminal sai do mapa
	nextID    atomic.Uint64
	persist   Persistence
	listDays  int // idade máxima de jobs terminal na ListFIFO/List (dias)
}

var defaultManager = &Manager{jobs: map[string]*Job{}, listDays: defaultTerminalListDays}

// Default retorna o manager singleton do processo.
func Default() *Manager { return defaultManager }

// SetPersistence ativa persistência em banco (nil desliga). Chamado uma vez no boot.
func (m *Manager) SetPersistence(p Persistence) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.persist = p
}

// SetTerminalListMaxAgeDays define quantos dias de histórico terminal incluir na listagem (default 30).
func (m *Manager) SetTerminalListMaxAgeDays(days int) {
	if days < 1 {
		days = defaultTerminalListDays
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.listDays = days
}

func (m *Manager) terminalDays() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.listDays < 1 {
		return defaultTerminalListDays
	}
	return m.listDays
}

// Start cria e registra um novo job, retornando o Job e um context cancelável.
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

	if m.persist != nil {
		if err := m.persist.UpsertRunning(job); err != nil {
			slog.Warn("jobs: UpsertRunning failed", "id", id, "err", err)
		}
	}

	m.AppendActivity(id, "job iniciado")
	return job, ctx
}

// AppendActivity adiciona linha ao histórico do job (cap maxActivityLines).
func (m *Manager) AppendActivity(id, msg string) {
	if msg == "" {
		return
	}
	m.mu.Lock()
	j, ok := m.jobs[id]
	if !ok || j.Status != StatusRunning {
		m.mu.Unlock()
		return
	}
	j.Activity = append(j.Activity, JobActivity{At: time.Now(), Message: msg})
	if len(j.Activity) > maxActivityLines {
		j.Activity = j.Activity[len(j.Activity)-maxActivityLines:]
	}
	m.mu.Unlock()

	if m.persist != nil {
		m.mu.RLock()
		j2 := m.jobs[id]
		m.mu.RUnlock()
		if j2 != nil && m.persist.SyncFromJob(j2) != nil {
			slog.Warn("jobs: SyncFromJob after AppendActivity failed", "id", id)
		}
	}
}

// ReconcileStaleRunning marca jobs running há mais de maxAge como failed.
func (m *Manager) ReconcileStaleRunning(maxAge time.Duration) int {
	now := time.Now()
	m.mu.Lock()
	var staleIDs []string
	for id, j := range m.jobs {
		if j.Status != StatusRunning {
			continue
		}
		if now.Sub(j.StartedAt) < maxAge {
			continue
		}
		staleIDs = append(staleIDs, id)
	}
	m.mu.Unlock()

	fixed := 0
	for _, id := range staleIDs {
		m.mu.Lock()
		j := m.jobs[id]
		if j == nil || j.Status != StatusRunning {
			m.mu.Unlock()
			continue
		}
		t := time.Now()
		j.Status = StatusFailed
		j.CompletedAt = &t
		j.Error = fmt.Sprintf("timeout da fila: running há mais de %v sem finalizar (servidor reiniciou ou goroutine presa)", maxAge)
		if j.Message == "" {
			j.Message = j.Error
		}
		if j.cancel != nil {
			j.cancel()
		}
		persist := m.persist
		m.mu.Unlock()

		if persist != nil {
			if err := persist.SetTerminal(j); err != nil {
				slog.Warn("jobs: SetTerminal stale", "id", j.ID, "err", err)
			}
			m.mu.Lock()
			delete(m.jobs, id)
			m.mu.Unlock()
		}
		fixed++
	}

	if m.persist != nil {
		n, err := m.persist.FailStaleRunning(maxAge)
		if err != nil {
			slog.Warn("jobs: FailStaleRunning DB", "err", err)
			return fixed
		}
		return fixed + n
	}
	return fixed
}

// Update atualiza progresso/mensagem do job.
func (m *Manager) Update(id string, done, total int, msg string) {
	m.mu.Lock()
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
	m.mu.Unlock()

	if m.persist != nil {
		m.mu.RLock()
		j := m.jobs[id]
		m.mu.RUnlock()
		if j != nil && m.persist.SyncFromJob(j) != nil {
			slog.Warn("jobs: SyncFromJob after Update failed", "id", id)
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
	j, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return
	}
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
	persist := m.persist
	m.mu.Unlock()

	if persist != nil {
		if err := persist.SetTerminal(j); err != nil {
			slog.Warn("jobs: SetTerminal failed", "id", id, "err", err)
		}
		m.mu.Lock()
		delete(m.jobs, id)
		m.mu.Unlock()
		return
	}
	// sem persistência: job permanece no mapa até Clear()
}

// Cancel cancela um job em execução.
func (m *Manager) Cancel(id string) bool {
	m.mu.Lock()
	j, ok := m.jobs[id]
	if !ok || j.Status != StatusRunning {
		m.mu.Unlock()
		return false
	}
	if j.cancel != nil {
		j.cancel()
	}
	now := time.Now()
	j.Status = StatusCancelled
	j.CompletedAt = &now
	persist := m.persist
	m.mu.Unlock()

	if persist != nil {
		if err := persist.SetTerminal(j); err != nil {
			slog.Warn("jobs: SetTerminal cancel failed", "id", id, "err", err)
		}
		m.mu.Lock()
		delete(m.jobs, id)
		m.mu.Unlock()
		return true
	}
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
	if m.persist != nil {
		out, err := m.persist.ListFIFO(150, m.terminalDays())
		if err != nil {
			slog.Warn("jobs: ListFIFO from DB failed", "err", err)
		} else {
			if desc {
				sort.Slice(out, func(i, j int) bool {
					return out[i].StartedAt.After(out[j].StartedAt)
				})
			}
			if len(out) > 150 {
				out = out[:150]
			}
			return out
		}
	}

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
	if m.persist != nil {
		n, err := m.persist.DeleteTerminalJobs()
		if err != nil {
			slog.Warn("jobs: DeleteTerminalJobs", "err", err)
		}
		return n
	}

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
	ids := make([]string, 0)
	for id, j := range m.jobs {
		if j.Status == StatusRunning {
			ids = append(ids, id)
		}
	}
	m.mu.Unlock()

	cancelled := 0
	for _, id := range ids {
		if m.Cancel(id) {
			cancelled++
		}
	}
	return cancelled
}

// HasRunning retorna true se há algum job rodando com o nome dado (pra dedup).
func (m *Manager) HasRunning(name string) bool {
	if m.persist != nil {
		ok, err := m.persist.HasRunningName(name)
		if err != nil {
			slog.Warn("jobs: HasRunningName", "err", err)
		} else if ok {
			return true
		}
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, j := range m.jobs {
		if j.Status == StatusRunning && j.Name == name {
			return true
		}
	}
	return false
}
