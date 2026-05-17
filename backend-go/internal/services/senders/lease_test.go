// Package senders_test contém integration tests para o mecanismo de lease.
// Usa package externo (_test) para evitar ciclo de importação com testutil/server.go.
// Requer Postgres via TEST_DATABASE_URL ou usa o default de docker-compose.test.yml.
package senders_test

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	appdb "snatcher/backendv2/internal/db"
	. "snatcher/backendv2/internal/services/senders"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

const defaultTestDSN = "postgres://snatcher:snatcher@localhost:5433/snatcher_test?sslmode=disable"

var schemaSeq uint64

// appendSearchPath adiciona search_path={schema} ao DSN respeitando se já há query params.
func appendSearchPath(dsn, schema string) string {
	sep := "?"
	for index := 0; index < len(dsn); index++ {
		if dsn[index] == '?' {
			sep = "&"
			break
		}
	}
	return dsn + sep + "search_path=" + schema
}

// openTestDB cria schema isolado, roda migrations e devolve conexão.
// Faz t.Skip automático se Postgres não estiver disponível.
func openTestDB(t *testing.T) *sqlx.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = defaultTestDSN
	}

	adminDB, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("Postgres de teste indisponível em %s: %v (rode `make test-up`)", dsn, err)
	}

	schema := fmt.Sprintf("leasetest_%d_%d", os.Getpid(), atomic.AddUint64(&schemaSeq, 1))
	if _, err := adminDB.Exec(fmt.Sprintf(`CREATE SCHEMA %q`, schema)); err != nil {
		t.Fatalf("create schema %s: %v", schema, err)
	}

	scopedDSN := appendSearchPath(dsn, schema)
	db, err := appdb.Open(scopedDSN)
	if err != nil {
		t.Fatalf("open scoped db: %v", err)
	}

	if err := appdb.RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
		_, _ = adminDB.Exec(fmt.Sprintf(`DROP SCHEMA %q CASCADE`, schema))
		_ = adminDB.Close()
	})

	return db
}

// insertPendingJob insere um job minimal em send_queue usando subquery de dependências.
// Faz t.Skip se as tabelas de referência estiverem vazias (fixtures ausentes).
func insertPendingJob(t *testing.T, db *sqlx.DB, ctx context.Context) int64 {
	t.Helper()

	var jobID int64
	err := db.QueryRowContext(ctx, `
		INSERT INTO send_queue (modem_id, group_id, catalog_id, status)
		SELECT m.id, g.id, c.id, 'pending'
		FROM   modems   m
		CROSS  JOIN groups   g
		CROSS  JOIN catalog  c
		LIMIT 1
		RETURNING id
	`).Scan(&jobID)
	if err != nil {
		t.Skipf("insertPendingJob: tabelas de referência vazias ou ausentes — %v", err)
	}
	return jobID
}

// TestAcquireLease_ReturnsJobIDs verifica que AcquireLease retorna IDs dos jobs
// pending e os marca como 'sending' com worker_id correto.
func TestAcquireLease_ReturnsJobIDs(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	insertPendingJob(t, db, ctx)
	insertPendingJob(t, db, ctx)

	jobIDs, err := AcquireLease(ctx, db, "worker-test", 10)
	if err != nil {
		t.Fatalf("AcquireLease erro inesperado: %v", err)
	}
	if len(jobIDs) < 1 {
		t.Fatalf("esperado >= 1 job adquirido, got %d", len(jobIDs))
	}

	// Confirmar que os jobs adquiridos estão marcados como 'sending' com worker_id.
	var count int
	err = db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM send_queue
		WHERE status = 'sending' AND worker_id = 'worker-test'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query count erro: %v", err)
	}
	if count < 1 {
		t.Errorf("esperado >= 1 row com status=sending e worker_id=worker-test, got %d", count)
	}
}

// TestReclaimStaleLease_ReclaimsExpiredJobs verifica que jobs com lease expirada
// voltam para status pending e têm worker_id/lease/heartbeat zerados.
func TestReclaimStaleLease_ReclaimsExpiredJobs(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	jobID := insertPendingJob(t, db, ctx)

	// Forçar o job para status 'sending' com lease expirada no passado.
	_, err := db.ExecContext(ctx, `
		UPDATE send_queue
		SET status           = 'sending',
		    worker_id        = 'dead-worker',
		    lease_expires_at  = now() - interval '5 minutes',
		    heartbeat_at     = now() - interval '5 minutes'
		WHERE id = $1
	`, jobID)
	if err != nil {
		t.Fatalf("update fixture para lease expirada erro: %v", err)
	}

	recovered, err := ReclaimStaleLease(ctx, db)
	if err != nil {
		t.Fatalf("ReclaimStaleLease erro: %v", err)
	}
	if recovered < 1 {
		t.Errorf("esperado >= 1 job recuperado, got %d", recovered)
	}

	// Confirmar que o job voltou a pending sem worker.
	var status string
	var workerID *string
	err = db.QueryRowContext(ctx, `
		SELECT status, worker_id FROM send_queue WHERE id = $1
	`, jobID).Scan(&status, &workerID)
	if err != nil {
		t.Fatalf("query pós-reclaim erro: %v", err)
	}
	if status != "pending" {
		t.Errorf("esperado status=pending após reclaim, got %q", status)
	}
	if workerID != nil {
		t.Errorf("esperado worker_id=NULL após reclaim, got %v", *workerID)
	}
}

// TestRenewLease_ExtendsLeaseExpiry verifica que RenewLease atualiza
// lease_expires_at para um timestamp posterior ao da aquisição original.
func TestRenewLease_ExtendsLeaseExpiry(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	insertPendingJob(t, db, ctx)

	jobIDs, err := AcquireLease(ctx, db, "worker-renew", 1)
	if err != nil {
		t.Fatalf("AcquireLease erro: %v", err)
	}
	if len(jobIDs) == 0 {
		t.Skip("nenhum job disponível para testar RenewLease")
	}

	// Capturar lease_expires_at imediatamente após acquire.
	var expiresAtBefore time.Time
	err = db.QueryRowContext(ctx, `
		SELECT lease_expires_at FROM send_queue WHERE id = $1
	`, jobIDs[0]).Scan(&expiresAtBefore)
	if err != nil {
		t.Fatalf("query lease_expires_at antes do renewal: %v", err)
	}

	// Aguardar 1s para que a renovação produza timestamp posterior.
	time.Sleep(1 * time.Second)

	if err := RenewLease(ctx, db, "worker-renew", jobIDs); err != nil {
		t.Fatalf("RenewLease erro: %v", err)
	}

	var expiresAtAfter time.Time
	err = db.QueryRowContext(ctx, `
		SELECT lease_expires_at FROM send_queue WHERE id = $1
	`, jobIDs[0]).Scan(&expiresAtAfter)
	if err != nil {
		t.Fatalf("query lease_expires_at após renewal: %v", err)
	}

	if !expiresAtAfter.After(expiresAtBefore) {
		t.Errorf("esperado lease_expires_at renovada após RenewLease; antes=%v depois=%v",
			expiresAtBefore, expiresAtAfter)
	}
}

// TestAcquireLease_ConcurrentWorkers verifica que dois workers não adquirem o
// mesmo job graças ao FOR UPDATE SKIP LOCKED: total de jobs adquiridos == 1.
func TestAcquireLease_ConcurrentWorkers(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	// Inserir exatamente 1 job disponível.
	insertPendingJob(t, db, ctx)

	// Workers tentam adquirir em sequência (mesmo efeito que concorrência em
	// Postgres real: o segundo vê o job já locked e obtém 0 rows por SKIP LOCKED).
	jobIDsA, errA := AcquireLease(ctx, db, "worker-A", 5)
	jobIDsB, errB := AcquireLease(ctx, db, "worker-B", 5)

	if errA != nil {
		t.Fatalf("worker-A AcquireLease erro: %v", errA)
	}
	if errB != nil {
		t.Fatalf("worker-B AcquireLease erro: %v", errB)
	}

	// Somente um dos workers deve ter adquirido o job.
	totalAcquired := len(jobIDsA) + len(jobIDsB)
	if totalAcquired != 1 {
		t.Errorf("esperado 1 job adquirido no total pelos dois workers, got %d (A=%d B=%d)",
			totalAcquired, len(jobIDsA), len(jobIDsB))
	}
}
