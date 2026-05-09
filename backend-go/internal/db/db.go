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
// Cada arquivo .sql só é executado uma vez — a tabela schema_migrations rastreia o que já foi aplicado.
func RunMigrations(db *sqlx.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		var applied bool
		if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, entry.Name()).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", entry.Name(), err)
		}
		if applied {
			continue
		}

		data, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read %s: %w", entry.Name(), err)
		}

		content := string(data)
		if idx := strings.Index(content, "-- migrate:down"); idx != -1 {
			content = content[:idx]
		}
		content = strings.ReplaceAll(content, "-- migrate:up", "")

		for _, stmt := range splitStatements(content) {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				if isIgnorableError(err) {
					continue
				}
				if strings.Contains(strings.ToUpper(stmt), "ALTER TABLE") {
					continue
				}
				preview := stmt
				if len(preview) > 200 {
					preview = preview[:200] + "..."
				}
				return fmt.Errorf("migration %s: %w\nstatement: %s", entry.Name(), err, preview)
			}
		}

		if _, err := db.Exec(`INSERT INTO schema_migrations (version) VALUES ($1)`, entry.Name()); err != nil {
			return fmt.Errorf("record migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func splitStatements(sql string) []string {
	var stmts []string
	current := strings.Builder{}
	inDollarQuote := false
	for _, line := range strings.Split(sql, "\n") {
		trimmed := strings.TrimSpace(line)
		if !inDollarQuote && strings.HasPrefix(trimmed, "--") {
			continue
		}
		// rastreia abertura/fechamento de $$ (dollar-quoting do Postgres)
		for i := 0; i+1 < len(trimmed); i++ {
			if trimmed[i] == '$' && trimmed[i+1] == '$' {
				inDollarQuote = !inDollarQuote
				i++
			}
		}
		current.WriteString(line)
		current.WriteByte('\n')
		if !inDollarQuote && strings.HasSuffix(trimmed, ";") {
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
