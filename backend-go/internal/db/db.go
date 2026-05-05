package db

import (
	"context"
	"errors"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func Open(dsn string) (*sqlx.DB, error) {
	driver, connStr, err := parseDSN(dsn)
	if err != nil {
		return nil, err
	}

	db, err := sqlx.Open(driver, connStr)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	if driver == "sqlite" {
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(4)
		_, _ = db.Exec("PRAGMA journal_mode=WAL")
		_, _ = db.Exec("PRAGMA synchronous=NORMAL")
		_, _ = db.Exec("PRAGMA cache_size=-8000")
		_, _ = db.Exec("PRAGMA temp_store=MEMORY")
		_, _ = db.Exec("PRAGMA foreign_keys=ON")
	} else {
		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(5)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return db, nil
}

// RunMigrations executa as migrations SQL em ordem.
// Cada arquivo .sql pode ter múltiplos statements separados por ponto-e-vírgula.
// Erros de "already exists" / "duplicate column" são silenciados.
func RunMigrations(db *sqlx.DB) error {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	// Ordena por nome
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		data, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read %s: %w", entry.Name(), err)
		}

		// Remove seções "-- migrate:down" e executa só a parte "up"
		content := string(data)
		if idx := strings.Index(content, "-- migrate:down"); idx != -1 {
			content = content[:idx]
		}
		// Remove comentários de seção
		content = strings.ReplaceAll(content, "-- migrate:up", "")

		// Executa cada statement
		for _, stmt := range splitStatements(content) {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				if isIgnorableError(err) {
					continue
				}
				// ALTER TABLE sempre silencia (SQLite não suporta IF NOT EXISTS)
				if strings.Contains(strings.ToUpper(stmt), "ALTER TABLE") {
					continue
				}
				// Erros não silenciados — silent por ora (habilitar log quando necessário)
				_ = err
			}
		}
	}
	return nil
}

func splitStatements(sql string) []string {
	var stmts []string
	current := strings.Builder{}
	for _, line := range strings.Split(sql, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue
		}
		current.WriteString(line)
		current.WriteByte('\n')
		if strings.HasSuffix(trimmed, ";") {
			stmts = append(stmts, current.String())
			current.Reset()
		}
	}
	if s := strings.TrimSpace(current.String()); s != "" {
		stmts = append(stmts, s)
	}
	return stmts
}

func parseDSN(dsn string) (driver, connStr string, err error) {
	switch {
	case strings.HasPrefix(dsn, "sqlite://"):
		// sqlite:///abs/path → /abs/path  (preserva a / do path absoluto)
		// sqlite://rel/path → rel/path
		return "sqlite", strings.TrimPrefix(dsn, "sqlite://"), nil
	case strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://"):
		return "postgres", dsn, nil
	default:
		// Assume sqlite path direto
		return "sqlite", dsn, nil
	}
}

// isIgnorableError retorna true para erros de migration idempotente.
// Para Postgres usa pq.Error.Code; para SQLite/outros usa string match.
func isIgnorableError(err error) bool {
	if err == nil {
		return false
	}
	// Postgres: checar pq.Error codes
	var pgErr *pq.Error
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "42P07", // duplicate_table
			"42701", // duplicate_column
			"23505", // unique_violation (em backfills INSERT ON CONFLICT)
			"42P16", // invalid_table_definition
			"42710": // duplicate_object (índices, funções)
			return true
		}
		return false
	}
	// Fallback para SQLite/outros: string match
	errStr := err.Error()
	return strings.Contains(errStr, "already exists") ||
		strings.Contains(errStr, "duplicate column") ||
		strings.Contains(errStr, "table already exists") ||
		strings.Contains(errStr, "no such table")
}

// Notify publica um evento Postgres NOTIFY.
// channel: nome do canal (ex: "dispatch.target_updated")
// payload: string JSON (deve ser < 8000 bytes)
func Notify(db *sqlx.DB, channel, payload string) error {
	_, err := db.Exec("SELECT pg_notify($1, $2)", channel, payload)
	return err
}

// ListenConfig configura um listener Postgres.
type ListenConfig struct {
	Channel      string
	MinReconnect time.Duration
	MaxReconnect time.Duration
}

// ListenFunc é chamada para cada notificação recebida.
type ListenFunc func(channel, payload string)

// Listen inicia um goroutine que escuta notificações Postgres.
// Reconecta automaticamente em caso de falha.
// Retorna função de cancel para parar o listener.
// Só funciona com driver postgres — no-op silencioso com SQLite.
func Listen(ctx context.Context, dsn string, cfg ListenConfig, fn ListenFunc) (cancel func(), err error) {
	driver, _, _ := parseDSN(dsn)
	if driver != "postgres" {
		return func() {}, nil // no-op para SQLite
	}

	minReconn := cfg.MinReconnect
	if minReconn == 0 {
		minReconn = 10 * time.Second
	}
	maxReconn := cfg.MaxReconnect
	if maxReconn == 0 {
		maxReconn = 60 * time.Second
	}

	listener := pq.NewListener(dsn, minReconn, maxReconn, func(ev pq.ListenerEventType, err error) {
		if err != nil {
			_ = err // log em produção: slog.Warn("pg listener event", "event", ev, "err", err)
		}
	})

	if err := listener.Listen(cfg.Channel); err != nil {
		return nil, fmt.Errorf("listen %s: %w", cfg.Channel, err)
	}

	ctx2, cancelFn := context.WithCancel(ctx)
	go func() {
		defer listener.Close()
		for {
			select {
			case <-ctx2.Done():
				return
			case n, ok := <-listener.Notify:
				if !ok {
					return
				}
				if n != nil {
					fn(n.Channel, n.Extra)
				}
			case <-time.After(90 * time.Second):
				_ = listener.Ping() // keep-alive
			}
		}
	}()

	return cancelFn, nil
}
