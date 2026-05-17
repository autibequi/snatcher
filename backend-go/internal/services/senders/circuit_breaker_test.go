package senders

import (
	"context"
	"sync"
	"testing"
	"time"
)

// fakeStore é uma implementação in-memory de cbStore para testes.
type fakeStore struct {
	mu     sync.Mutex
	states map[UpstreamName]CircuitBreakerState
}

func newFakeStore(upstream UpstreamName) *fakeStore {
	return &fakeStore{
		states: map[UpstreamName]CircuitBreakerState{
			upstream: {UpstreamName: string(upstream), State: BrkClosed},
		},
	}
}

func (f *fakeStore) load(_ context.Context, upstream UpstreamName) (CircuitBreakerState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.states[upstream], nil
}

func (f *fakeStore) save(_ context.Context, s CircuitBreakerState) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.states[UpstreamName(s.UpstreamName)] = s
	return nil
}

func (f *fakeStore) getState(upstream UpstreamName) CircuitBreakerState {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.states[upstream]
}

// newTestBreaker cria um CircuitBreaker com fakeStore e openDuration controlável.
func newTestBreaker(t *testing.T, upstream UpstreamName, threshold int, openDuration time.Duration) (*CircuitBreaker, *fakeStore) {
	t.Helper()
	store := newFakeStore(upstream)
	cb := newCircuitBreakerWithStore(store, upstream, threshold, openDuration)
	return cb, store
}

// TestCircuitBreaker_ClosedToOpen — falhas consecutivas até threshold abrem o breaker.
func TestCircuitBreaker_ClosedToOpen(t *testing.T) {
	const threshold = 3
	ctx := context.Background()
	cb, store := newTestBreaker(t, UpstreamEvolutionAPI, threshold, 30*time.Second)

	// Inicialmente fechado.
	open, err := cb.IsOpen(ctx)
	if err != nil {
		t.Fatalf("IsOpen erro inesperado: %v", err)
	}
	if open {
		t.Fatal("breaker deve iniciar closed")
	}

	// threshold-1 falhas: ainda closed.
	for i := 0; i < threshold-1; i++ {
		if rErr := cb.RecordFailure(ctx); rErr != nil {
			t.Fatalf("RecordFailure[%d]: %v", i, rErr)
		}
	}
	open, _ = cb.IsOpen(ctx)
	if open {
		t.Fatalf("breaker não deve abrir com %d falhas (threshold=%d)", threshold-1, threshold)
	}

	// Última falha: atinge threshold → abre.
	if rErr := cb.RecordFailure(ctx); rErr != nil {
		t.Fatalf("RecordFailure final: %v", rErr)
	}
	open, err = cb.IsOpen(ctx)
	if err != nil {
		t.Fatalf("IsOpen após abrir: %v", err)
	}
	if !open {
		t.Fatal("breaker deve estar open após atingir threshold")
	}
	if got := store.getState(UpstreamEvolutionAPI).State; got != BrkOpen {
		t.Fatalf("state no store: want %s got %s", BrkOpen, got)
	}
}

// TestCircuitBreaker_OpenToHalfOpen — após openDuration expirar, IsOpen transiciona para half_open.
func TestCircuitBreaker_OpenToHalfOpen(t *testing.T) {
	ctx := context.Background()
	// openDuration muito curta para o teste não ficar lento.
	cb, store := newTestBreaker(t, UpstreamLLM, 1, 1*time.Millisecond)

	// Forçar estado open diretamente no store.
	past := time.Now().Add(-10 * time.Millisecond)
	store.save(ctx, CircuitBreakerState{ //nolint:errcheck
		UpstreamName: string(UpstreamLLM),
		State:        BrkOpen,
		FailureCount: 1,
		OpenedAt:     &past,
	})

	// IsOpen deve detectar expiração e transicionar para half_open → retornar false.
	open, err := cb.IsOpen(ctx)
	if err != nil {
		t.Fatalf("IsOpen: %v", err)
	}
	if open {
		t.Fatal("breaker deve retornar false ao transicionar para half_open")
	}
	if got := store.getState(UpstreamLLM).State; got != BrkHalfOpen {
		t.Fatalf("state após transição: want %s got %s", BrkHalfOpen, got)
	}
}

// TestCircuitBreaker_HalfOpenSuccessCloses — sucesso em half_open fecha o breaker.
func TestCircuitBreaker_HalfOpenSuccessCloses(t *testing.T) {
	ctx := context.Background()
	cb, store := newTestBreaker(t, UpstreamEvolutionAPI, 3, 30*time.Second)

	// Forçar estado half_open.
	store.save(ctx, CircuitBreakerState{ //nolint:errcheck
		UpstreamName: string(UpstreamEvolutionAPI),
		State:        BrkHalfOpen,
		FailureCount: 3,
	})

	if err := cb.RecordSuccess(ctx); err != nil {
		t.Fatalf("RecordSuccess: %v", err)
	}

	st := store.getState(UpstreamEvolutionAPI)
	if st.State != BrkClosed {
		t.Fatalf("want %s got %s", BrkClosed, st.State)
	}
	if st.FailureCount != 0 {
		t.Fatalf("failure_count deve ser 0 após sucesso, got %d", st.FailureCount)
	}
	if st.OpenedAt != nil {
		t.Fatal("opened_at deve ser nil após fechar")
	}
}

// TestCircuitBreaker_HalfOpenFailureReopens — falha em half_open reabre o breaker.
func TestCircuitBreaker_HalfOpenFailureReopens(t *testing.T) {
	ctx := context.Background()
	// threshold=1: uma falha já abre.
	cb, store := newTestBreaker(t, UpstreamLLM, 1, 60*time.Second)

	// Forçar estado half_open com failure_count=0 (zerado pelo probe anterior).
	store.save(ctx, CircuitBreakerState{ //nolint:errcheck
		UpstreamName: string(UpstreamLLM),
		State:        BrkHalfOpen,
		FailureCount: 0,
	})

	if err := cb.RecordFailure(ctx); err != nil {
		t.Fatalf("RecordFailure: %v", err)
	}

	st := store.getState(UpstreamLLM)
	if st.State != BrkOpen {
		t.Fatalf("want %s got %s", BrkOpen, st.State)
	}
	if st.OpenedAt == nil {
		t.Fatal("opened_at deve ser preenchido ao reabrir")
	}
}
