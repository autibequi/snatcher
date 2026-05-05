// Package testutil fornece helpers para integration tests:
// banco de dados Postgres efêmero, servidor HTTP completo e factories de
// fixtures. Reduz boilerplate e garante que cada teste roda contra schema real
// (mesmas migrations da produção).
package testutil

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	appdb "snatcher/backendv2/internal/db"

	"github.com/jmoiron/sqlx"
)

// DefaultTestDSN é o DSN para o Postgres efêmero subido por
// docker-compose.test.yml. Pode ser sobrescrito via env TEST_DATABASE_URL.
const DefaultTestDSN = "postgres://snatcher:snatcher@localhost:5433/snatcher_test?sslmode=disable"

var (
	adminDBOnce sync.Once
	adminDB     *sqlx.DB
	adminDBErr  error
	schemaSeq   uint64
)

// NewTestDB cria um schema isolado dentro do Postgres de teste, roda todas as
// migrations e devolve a conexão. Cleanup (DROP SCHEMA CASCADE) é registrado
// via t.Cleanup, então cada teste tem dados próprios sem interferência.
func NewTestDB(t *testing.T) *sqlx.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = DefaultTestDSN
	}

	adminDBOnce.Do(func() {
		adminDB, adminDBErr = sqlx.Connect("postgres", dsn)
	})
	if adminDBErr != nil {
		t.Skipf("Postgres de teste indisponível em %s: %v (rode `make test-up`)", dsn, adminDBErr)
	}

	schema := fmt.Sprintf("test_%d_%d", os.Getpid(), atomic.AddUint64(&schemaSeq, 1))
	if _, err := adminDB.Exec(fmt.Sprintf(`CREATE SCHEMA %q`, schema)); err != nil {
		t.Fatalf("create schema %s: %v", schema, err)
	}

	scopedDSN := withSearchPath(dsn, schema)
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
	})

	return db
}

// MustPG é um alias para NewTestDB que documenta explicitamente que o teste
// requer Postgres. Faz skip automático se o banco não estiver disponível.
func MustPG(t *testing.T) *sqlx.DB {
	t.Helper()
	return NewTestDB(t)
}

// withSearchPath adiciona search_path={schema} aos parâmetros do DSN para que
// queries sejam isoladas no schema do teste.
func withSearchPath(dsn, schema string) string {
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	return dsn + sep + "search_path=" + schema
}
