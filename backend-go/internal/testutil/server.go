package testutil

import (
	"net/http/httptest"
	"testing"

	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/router"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/store"

	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

// TestServer agrega o httptest.Server e os componentes injetáveis usados em
// asserts (store para inserir fixtures, secret para gerar JWTs).
type TestServer struct {
	*httptest.Server
	Store       store.Store
	JWTSecret   string
	AdminUser   string // email do admin
	AdminPass   string
	AdminUserID int64
	DB          *sqlx.DB
}

// NewTestServer monta o router real (mesmo Build da produção), com pipeline e
// scheduler instanciados sobre mapas vazios — endpoints que disparariam crawl
// real são exercidos apenas via DB direto pelo store.
func NewTestServer(t *testing.T, db *sqlx.DB) *TestServer {
	t.Helper()

	st := store.New(db)

	rd := redirect.New(db, st)

	scrapers := map[string]pipeline.Scraper{}
	adapters := pipeline.AdapterRegistry{}

	runner := pipeline.NewRunner(st, scrapers, adapters)
	sched, err := scheduler.New(60, runner, nil, st, nil)
	if err != nil {
		t.Fatalf("scheduler.New: %v", err)
	}

	const (
		jwtSecret = "test-secret-please-change"
		adminUser = "admin@test.local"
		adminPass = "admin-test-pass"
	)

	// Seed do admin user na tabela users
	hash, err := bcrypt.GenerateFromPassword([]byte(adminPass), 4) // cost baixo em testes
	if err != nil {
		t.Fatalf("bcrypt hash: %v", err)
	}
	var adminID int64
	err = db.QueryRow(
		`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Admin', 'admin')
		 ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
		 RETURNING id`,
		adminUser, string(hash),
	).Scan(&adminID)
	if err != nil {
		t.Fatalf("seed admin user: %v", err)
	}

	h := router.Build(db, st, rd, runner, sched, scrapers, adapters, jwtSecret)
	srv := httptest.NewServer(h)

	t.Cleanup(srv.Close)

	return &TestServer{
		Server:      srv,
		Store:       st,
		JWTSecret:   jwtSecret,
		AdminUser:   adminUser,
		AdminPass:   adminPass,
		AdminUserID: adminID,
		DB:          db,
	}
}
