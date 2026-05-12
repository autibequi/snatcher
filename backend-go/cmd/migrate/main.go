package main

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

const usage = `Usage: migrate <command> [arg]

Commands:
  up              Apply all pending migrations
  down            Revert the last migration
  version         Show current migration version
  force <V>       Set version V without running migrations (force state sync)
  goto <V>        Migrate to specific version V (up or down)
  drop            Drop everything in the database (DANGEROUS)

Environment:
  DATABASE_URL    Postgres connection string (postgres://user:pass@host/db)
  MIGRATIONS_PATH Path to migrations dir (default: internal/db/migrations)
`

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(1)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL not set")
		os.Exit(1)
	}

	migrationsPath := os.Getenv("MIGRATIONS_PATH")
	if migrationsPath == "" {
		// Default: relative to cwd — works when run from backend-go/
		migrationsPath = "internal/db/migrations"
	}

	// golang-migrate expects an absolute path or file:// URI
	absPath, err := filepath.Abs(migrationsPath)
	if err != nil {
		slog.Error("resolve migrations path", "err", err)
		os.Exit(1)
	}
	sourceURL := "file://" + absPath

	m, err := migrate.New(sourceURL, dbURL)
	if err != nil {
		slog.Error("create migrator", "err", err)
		os.Exit(1)
	}
	defer func() { srcErr, dbErr := m.Close(); _ = srcErr; _ = dbErr }()

	cmd := os.Args[1]

	switch cmd {
	case "up":
		if err := m.Up(); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				slog.Info("no migrations to apply")
				os.Exit(0)
			}
			slog.Error("migrate up", "err", err)
			os.Exit(1)
		}
		slog.Info("migrations applied successfully")

	case "down":
		if err := m.Steps(-1); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				slog.Info("already at base version, nothing to revert")
				os.Exit(0)
			}
			slog.Error("migrate down", "err", err)
			os.Exit(1)
		}
		slog.Info("reverted last migration")

	case "version":
		version, dirty, err := m.Version()
		if err != nil {
			if errors.Is(err, migrate.ErrNilVersion) {
				slog.Info("no migrations applied yet (version: nil)")
				os.Exit(0)
			}
			slog.Error("get version", "err", err)
			os.Exit(1)
		}
		dirtyStr := ""
		if dirty {
			dirtyStr = " (dirty)"
		}
		fmt.Printf("version: %d%s\n", version, dirtyStr)

	case "force":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "force requires a version argument")
			os.Exit(1)
		}
		v, err := strconv.Atoi(os.Args[2])
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid version %q: %v\n", os.Args[2], err)
			os.Exit(1)
		}
		if err := m.Force(v); err != nil {
			slog.Error("force version", "version", v, "err", err)
			os.Exit(1)
		}
		slog.Info("forced version", "version", v)

	case "goto":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "goto requires a version argument")
			os.Exit(1)
		}
		v, err := strconv.ParseUint(os.Args[2], 10, 64)
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid version %q: %v\n", os.Args[2], err)
			os.Exit(1)
		}
		if err := m.Migrate(uint(v)); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				slog.Info("already at target version", "version", v)
				os.Exit(0)
			}
			slog.Error("goto version", "version", v, "err", err)
			os.Exit(1)
		}
		slog.Info("migrated to version", "version", v)

	case "drop":
		slog.Warn("dropping all database objects — this is destructive")
		if err := m.Drop(); err != nil {
			slog.Error("drop", "err", err)
			os.Exit(1)
		}
		slog.Info("database dropped")

	default:
		fmt.Fprintf(os.Stderr, "unknown command: %q\n\n%s", cmd, usage)
		os.Exit(1)
	}
}
