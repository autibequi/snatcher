package senders

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"

	appdb "snatcher/backendv2/internal/db"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

const defaultRoutingTestDSN = "postgres://snatcher:snatcher@localhost:5433/snatcher_test?sslmode=disable"

var routingSchemaSeq uint64

// appendRoutingSearchPath adiciona search_path={schema} ao DSN.
func appendRoutingSearchPath(dsn, schema string) string {
	sep := "?"
	for i := 0; i < len(dsn); i++ {
		if dsn[i] == '?' {
			sep = "&"
			break
		}
	}
	return dsn + sep + "search_path=" + schema
}

// openRoutingTestDB cria schema isolado, roda migrations e devolve conexão.
// Faz t.Skip automático se Postgres não estiver disponível.
func openRoutingTestDB(t *testing.T) *sqlx.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = defaultRoutingTestDSN
	}

	adminDB, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("Postgres de teste indisponível em %s: %v (rode `make test-up`)", dsn, err)
	}

	schema := fmt.Sprintf("routingtest_%d_%d", os.Getpid(), atomic.AddUint64(&routingSchemaSeq, 1))
	if _, err := adminDB.Exec(fmt.Sprintf(`CREATE SCHEMA %q`, schema)); err != nil {
		t.Fatalf("create schema %s: %v", schema, err)
	}

	scopedDSN := appendRoutingSearchPath(dsn, schema)
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

// insertActiveDomain insere um redirect_domain com enabled=true e retorna seu ID.
// modemID=nil cria um domínio sem afinidade de modem (pool comum).
func insertActiveDomain(t *testing.T, db *sqlx.DB, ctx context.Context, modemID *int64) int64 {
	t.Helper()
	var id int64
	var err error
	if modemID != nil {
		err = db.QueryRowContext(ctx, `
			INSERT INTO redirect_domains (host, enabled, modem_id)
			VALUES ($1, true, $2)
			RETURNING id
		`, fmt.Sprintf("domain-modem-%d.test", *modemID), *modemID).Scan(&id)
	} else {
		err = db.QueryRowContext(ctx, `
			INSERT INTO redirect_domains (host, enabled)
			VALUES ('domain-legacy.test', true)
			RETURNING id
		`).Scan(&id)
	}
	if err != nil {
		t.Skipf("insertActiveDomain: falha ao inserir domínio (schema ausente?) — %v", err)
	}
	return id
}

// TestPickDomain_PrefersModemRouting verifica que pickRedirectDomainID retorna
// o domínio cujo modem_id corresponde ao modem solicitado quando esse existe,
// em detrimento de outros domínios sem afinidade de modem.
func TestPickDomain_PrefersModemRouting(t *testing.T) {
	db := openRoutingTestDB(t)
	ctx := context.Background()

	const modemID int64 = 7

	// Inserir domínio sem afinidade (legacy/pool comum).
	insertActiveDomain(t, db, ctx, nil)

	// Inserir domínio com afinidade para modemID=7.
	modem := modemID
	wantDomainID := insertActiveDomain(t, db, ctx, &modem)

	got, err := pickRedirectDomainID(ctx, db, modemID)
	if err != nil {
		t.Fatalf("pickRedirectDomainID erro inesperado: %v", err)
	}
	if got == nil {
		t.Fatal("pickRedirectDomainID retornou nil — esperado domain_id")
	}
	if *got != wantDomainID {
		t.Errorf("esperado domain_id=%d (afinidade modem=%d), got %d", wantDomainID, modemID, *got)
	}
}

// TestPickDomain_FallbackToLegacy verifica que pickRedirectDomainID retorna algum
// domínio ativo quando não há domínio com afinidade para o modemID solicitado.
// O fallback garante que a fila não trave por falta de domínio.
func TestPickDomain_FallbackToLegacy(t *testing.T) {
	db := openRoutingTestDB(t)
	ctx := context.Background()

	const modemID int64 = 99 // modem sem afinidade cadastrada

	// Inserir apenas um domínio sem afinidade de modem.
	legacyID := insertActiveDomain(t, db, ctx, nil)

	got, err := pickRedirectDomainID(ctx, db, modemID)
	if err != nil {
		t.Fatalf("pickRedirectDomainID erro inesperado no fallback: %v", err)
	}
	if got == nil {
		t.Fatal("pickRedirectDomainID retornou nil no fallback — deve usar domínio ativo disponível")
	}
	if *got != legacyID {
		t.Errorf("esperado fallback domain_id=%d (único ativo), got %d", legacyID, *got)
	}
}

// TestPickDomain_ReturnsNilWhenNoActiveDomains verifica que pickRedirectDomainID
// retorna nil (sem erro) quando não existem domínios ativos no sistema.
func TestPickDomain_ReturnsNilWhenNoActiveDomains(t *testing.T) {
	db := openRoutingTestDB(t)
	ctx := context.Background()

	// Nenhum domínio inserido — schema limpo pós-migration.
	got, err := pickRedirectDomainID(ctx, db, 1)
	if err != nil {
		t.Fatalf("pickRedirectDomainID com tabela vazia deve retornar nil, got err: %v", err)
	}
	if got != nil {
		t.Errorf("esperado nil quando sem domínios ativos, got %d", *got)
	}
}
