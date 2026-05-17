package senders

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

// UpstreamName identifica o upstream externo monitorado pelo circuit breaker.
type UpstreamName string

const (
	UpstreamEvolutionAPI UpstreamName = "evolution_api"
	UpstreamLLM         UpstreamName = "llm"
)

// breakerState mapeia o enum circuit_breaker_state_t do banco.
type breakerState string

const (
	BrkClosed   breakerState = "closed"
	BrkOpen     breakerState = "open"
	BrkHalfOpen breakerState = "half_open"
)

// CircuitBreakerState mapeia uma linha da tabela circuit_breaker_state.
type CircuitBreakerState struct {
	UpstreamName  string       `db:"upstream"`
	State         breakerState `db:"state"`
	FailureCount  int          `db:"failure_count"`
	LastFailureAt *time.Time   `db:"last_failure_at"`
	OpenedAt      *time.Time   `db:"opened_at"`
}

// cbStore é a interface de persistência do circuit breaker.
// Permite injeção de fake em testes sem dependência de banco real.
type cbStore interface {
	// load lê o estado atual do upstream.
	load(ctx context.Context, upstream UpstreamName) (CircuitBreakerState, error)
	// save persiste um estado atualizado.
	save(ctx context.Context, s CircuitBreakerState) error
}

// --- Implementação DB (sqlx) ---

type cbSQLStore struct {
	db *sqlx.DB
}

func (s *cbSQLStore) load(ctx context.Context, upstream UpstreamName) (CircuitBreakerState, error) {
	var row CircuitBreakerState
	err := s.db.GetContext(ctx, &row, `
		SELECT upstream, state::text AS state, failure_count, last_failure_at, opened_at
		FROM circuit_breaker_state
		WHERE upstream = $1`,
		string(upstream))
	if err != nil {
		return CircuitBreakerState{}, fmt.Errorf("cbStore.load %s: %w", upstream, err)
	}
	return row, nil
}

func (s *cbSQLStore) save(ctx context.Context, st CircuitBreakerState) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE circuit_breaker_state
		SET state = $2::circuit_breaker_state_t,
		    failure_count = $3,
		    last_failure_at = $4,
		    opened_at = $5,
		    half_open_probe_at = CASE WHEN $2 = 'half_open' THEN now() ELSE half_open_probe_at END,
		    last_success_at = CASE WHEN $2 = 'closed' THEN now() ELSE last_success_at END
		WHERE upstream = $1`,
		st.UpstreamName, string(st.State), st.FailureCount, st.LastFailureAt, st.OpenedAt)
	if err != nil {
		return fmt.Errorf("cbStore.save %s: %w", st.UpstreamName, err)
	}
	return nil
}

// --- Circuit Breaker ---

// CircuitBreaker gerencia o estado de circuit breaker de um upstream específico.
// Estado persistido via cbStore para garantir consistência entre múltiplos workers.
type CircuitBreaker struct {
	store            cbStore
	upstream         UpstreamName
	failureThreshold int
	openDuration     time.Duration
}

// NewCircuitBreaker cria um CircuitBreaker DB-backed para o upstream fornecido.
// failureThreshold: número de falhas acumuladas para abrir o breaker.
// openDuration: tempo mínimo antes de transicionar open → half_open.
func NewCircuitBreaker(db *sqlx.DB, upstream UpstreamName, failureThreshold int, openDuration time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		store:            &cbSQLStore{db: db},
		upstream:         upstream,
		failureThreshold: failureThreshold,
		openDuration:     openDuration,
	}
}

// newCircuitBreakerWithStore cria um CircuitBreaker com store customizado (usado em testes).
func newCircuitBreakerWithStore(store cbStore, upstream UpstreamName, failureThreshold int, openDuration time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		store:            store,
		upstream:         upstream,
		failureThreshold: failureThreshold,
		openDuration:     openDuration,
	}
}

// IsOpen retorna true se o breaker está aberto (chamadas bloqueadas).
// Se o estado for open mas openDuration já expirou, transiciona para half_open e retorna false.
func (cb *CircuitBreaker) IsOpen(ctx context.Context) (bool, error) {
	st, err := cb.store.load(ctx, cb.upstream)
	if err != nil {
		return false, err
	}

	if st.State == BrkOpen {
		if st.OpenedAt != nil && time.Since(*st.OpenedAt) > cb.openDuration {
			// Transicionar para half_open: permite probe.
			now := time.Now()
			st.State = BrkHalfOpen
			st.OpenedAt = &now
			if sErr := cb.store.save(ctx, st); sErr != nil {
				return false, sErr
			}
			return false, nil
		}
		return true, nil
	}

	return false, nil
}

// RecordSuccess registra uma chamada bem-sucedida.
// Qualquer estado → closed, zerando failure_count.
func (cb *CircuitBreaker) RecordSuccess(ctx context.Context) error {
	st, err := cb.store.load(ctx, cb.upstream)
	if err != nil {
		return err
	}
	st.State = BrkClosed
	st.FailureCount = 0
	st.OpenedAt = nil
	st.LastFailureAt = nil
	return cb.store.save(ctx, st)
}

// RecordFailure registra uma falha. Se failure_count >= failureThreshold, abre o breaker.
func (cb *CircuitBreaker) RecordFailure(ctx context.Context) error {
	st, err := cb.store.load(ctx, cb.upstream)
	if err != nil {
		return err
	}
	st.FailureCount++
	now := time.Now()
	st.LastFailureAt = &now
	if st.FailureCount >= cb.failureThreshold {
		st.State = BrkOpen
		st.OpenedAt = &now
	}
	return cb.store.save(ctx, st)
}

// --- Circuit Breaker Manager ---

// CircuitBreakerManager mantém um mapa de circuit breakers por upstream.
// Defaults: Evolution API → threshold=5, openDuration=30s; LLM → threshold=3, openDuration=60s.
type CircuitBreakerManager struct {
	mu       sync.RWMutex
	breakers map[UpstreamName]*CircuitBreaker
}

// NewCircuitBreakerManager cria um manager com defaults por upstream.
func NewCircuitBreakerManager(db *sqlx.DB) *CircuitBreakerManager {
	return &CircuitBreakerManager{
		breakers: map[UpstreamName]*CircuitBreaker{
			UpstreamEvolutionAPI: NewCircuitBreaker(db, UpstreamEvolutionAPI, 5, 30*time.Second),
			UpstreamLLM:         NewCircuitBreaker(db, UpstreamLLM, 3, 60*time.Second),
		},
	}
}

// Get retorna o CircuitBreaker para o upstream. Retorna nil se upstream desconhecido.
func (m *CircuitBreakerManager) Get(name UpstreamName) *CircuitBreaker {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.breakers[name]
}
