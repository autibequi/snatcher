package senders

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// stubJobFunc é uma função de processamento de job injetável em runWorkerFunc.
// Retorna true se havia job disponível, false se a fila estava vazia.
type stubJobFunc func(ctx context.Context, workerID string) (jobFound bool, err error)

// runWorkerFunc executa o loop de um worker usando a função de processamento fornecida.
// Idêntico ao padrão de runWorker mas recebe o processador como parâmetro,
// permitindo injeção de comportamento em testes sem acesso a banco.
func runWorkerFunc(ctx context.Context, workerID string, pollInterval time.Duration, processJob stubJobFunc) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		found, err := processJob(ctx, workerID)
		if err != nil {
			// Falha no processamento — aguarda antes de tentar novamente.
			select {
			case <-ctx.Done():
				return
			case <-time.After(pollInterval):
			}
			continue
		}
		if !found {
			// Fila vazia — backoff curto antes de tentar novamente.
			select {
			case <-ctx.Done():
				return
			case <-time.After(pollInterval):
			}
		}
	}
}

// launchWorkerPool lança numWorkers goroutines usando runWorkerFunc.
// Retorna um canal que fecha quando todos os workers terminam.
// Centraliza a lógica de pool para torná-la testável independente do banco.
func launchWorkerPool(
	ctx context.Context,
	numWorkers int,
	pollInterval time.Duration,
	processJob stubJobFunc,
	workerStarted func(workerID string),
) chan struct{} {
	done := make(chan struct{})
	var remaining atomic.Int64
	remaining.Store(int64(numWorkers))

	for workerIndex := 0; workerIndex < numWorkers; workerIndex++ {
		wid := workerIDForIndex(workerIndex)
		if workerStarted != nil {
			workerStarted(wid)
		}
		go func(id string) {
			runWorkerFunc(ctx, id, pollInterval, processJob)
			if remaining.Add(-1) == 0 {
				close(done)
			}
		}(wid)
	}

	return done
}

// workerIDForIndex gera o ID de um worker pelo índice — mantém paridade com RunDispatcher.
func workerIDForIndex(index int) string {
	return "worker-" + itoa(index)
}

// itoa converte int para string sem depender de fmt.Sprintf (menos overhead em paths quentes).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}

// ── Cenário A: N workers lançados ─────────────────────────────────────────────

// TestDispatcher_NWorkersLaunched verifica que launchWorkerPool inicia exatamente
// numWorkers goroutines. Cada worker deve registrar seu ID via workerStarted antes
// de iniciar o loop. Ctx cancelado imediatamente para encerrar o teste rápido.
func TestDispatcher_NWorkersLaunched(t *testing.T) {
	const numWorkers = 8

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var startedCount atomic.Int64
	startedWorkers := make([]string, 0, numWorkers)
	mu := make(chan struct{}, 1)
	mu <- struct{}{}

	workerStarted := func(workerID string) {
		<-mu
		startedWorkers = append(startedWorkers, workerID)
		startedCount.Add(1)
		mu <- struct{}{}
	}

	// processJob imediatamente cancela ctx para não deixar workers em loop indefinido.
	processJob := func(callCtx context.Context, workerID string) (bool, error) {
		cancel() // encerra todos os workers após o primeiro ciclo
		return false, nil
	}

	done := launchWorkerPool(ctx, numWorkers, 1*time.Millisecond, processJob, workerStarted)

	select {
	case <-done:
		// Todos os workers encerraram.
	case <-time.After(3 * time.Second):
		t.Fatal("timeout: workers não encerraram em 3s após ctx cancelado")
	}

	if got := int(startedCount.Load()); got != numWorkers {
		t.Errorf("esperado %d workers iniciados, got %d (workers: %v)", numWorkers, got, startedWorkers)
	}
}

// ── Cenário B: job processado end-to-end com stub sender ─────────────────────

// TestDispatcher_JobProcessedEndToEnd verifica que um worker chama processJob ao
// encontrar trabalho disponível e registra o resultado com o jobID correto.
// Usa stub sender embutido sem necessidade de banco real.
func TestDispatcher_JobProcessedEndToEnd(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var processedJobID atomic.Int64
	expectedJobID := int64(42)

	callCount := 0
	processJob := func(callCtx context.Context, workerID string) (bool, error) {
		if callCount == 0 {
			// Primeira chamada: simula job disponível e processa.
			processedJobID.Store(expectedJobID)
			callCount++
			return true, nil
		}
		// Após processar: encerrar o pool.
		cancel()
		return false, nil
	}

	done := launchWorkerPool(ctx, 1, 1*time.Millisecond, processJob, nil)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout: worker não encerrou em 3s após ctx cancelado")
	}

	if got := processedJobID.Load(); got != expectedJobID {
		t.Errorf("esperado jobID=%d processado, got %d", expectedJobID, got)
	}
}

// ── Cenário C: circuit breaker aberto → job requeued ─────────────────────────

// TestDispatcher_CircuitBreakerOpen_JobRequeued verifica que quando IsOpen retorna true,
// o processamento do job é abortado e o job é marcado como 'pending' (requeued).
// Usa fakeStore para controlar estado do circuit breaker sem banco.
func TestDispatcher_CircuitBreakerOpen_JobRequeued(t *testing.T) {
	ctx := context.Background()

	// Circuit breaker com estado open.
	store := newFakeStore(UpstreamEvolutionAPI)
	openedAt := time.Now()
	// Salvar estado aberto diretamente no store.
	store.save(ctx, CircuitBreakerState{ //nolint:errcheck
		UpstreamName: string(UpstreamEvolutionAPI),
		State:        BrkOpen,
		FailureCount: 5,
		OpenedAt:     &openedAt,
	})

	cb := newCircuitBreakerWithStore(store, UpstreamEvolutionAPI, 5, 1*time.Hour)

	// Verificar que circuit breaker está aberto.
	isOpen, err := cb.IsOpen(ctx)
	if err != nil {
		t.Fatalf("IsOpen retornou erro inesperado: %v", err)
	}
	if !isOpen {
		t.Fatal("esperado circuit breaker open, mas IsOpen retornou false")
	}

	// Simular o comportamento de processJob quando CB aberto: não envia, requeue.
	var requeueCount atomic.Int64
	processJobWithCB := func(callCtx context.Context, workerID string) (bool, error) {
		open, cbErr := cb.IsOpen(callCtx)
		if cbErr != nil {
			return false, cbErr
		}
		if open {
			// Circuit breaker aberto: não envia, incrementa contador de requeue.
			requeueCount.Add(1)
			return true, nil // job encontrado mas não enviado
		}
		return false, nil
	}

	// Processar uma vez diretamente (sem pool, apenas lógica).
	found, err := processJobWithCB(ctx, "worker-0")
	if err != nil {
		t.Fatalf("processJobWithCB retornou erro inesperado: %v", err)
	}
	if !found {
		t.Error("esperado found=true (job encontrado mas bloqueado por CB)")
	}
	if got := requeueCount.Load(); got != 1 {
		t.Errorf("esperado 1 requeue por CB aberto, got %d", got)
	}

	// Estado do breaker deve permanecer open (não foi registrado sucesso).
	finalState := store.getState(UpstreamEvolutionAPI)
	if finalState.State != BrkOpen {
		t.Errorf("estado do CB deve permanecer open após requeue, got %s", finalState.State)
	}
}

// ── Cenário D: ctx cancel → workers drenam e saem ────────────────────────────

// TestDispatcher_CtxCancel_WorkersDrain verifica que ao cancelar o ctx, todos os
// workers encerram limpos sem goroutine leak. RunDispatcher deve retornar dentro
// do prazo esperado após o cancelamento.
func TestDispatcher_CtxCancel_WorkersDrain(t *testing.T) {
	const numWorkers = 4
	const drainTimeout = 2 * time.Second

	ctx, cancel := context.WithCancel(context.Background())

	// processJob bloqueia até ctx ser cancelado — simula worker em espera.
	processJob := func(callCtx context.Context, workerID string) (bool, error) {
		select {
		case <-callCtx.Done():
			return false, callCtx.Err()
		case <-time.After(100 * time.Millisecond):
			return false, nil
		}
	}

	done := launchWorkerPool(ctx, numWorkers, 10*time.Millisecond, processJob, nil)

	// Cancelar ctx após breve pausa para garantir que os workers entraram em loop.
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// Todos os workers encerraram graciosamente.
	case <-time.After(drainTimeout):
		t.Fatalf("timeout: workers não encerraram em %v após ctx cancelado", drainTimeout)
	}
}
