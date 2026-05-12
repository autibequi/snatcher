package main

import (
	"log/slog"
	"os"

	appdb "snatcher/backendv2/internal/db"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		slog.Error("DATABASE_URL not set")
		os.Exit(1)
	}

	db, err := sqlx.Open("postgres", dsn)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		slog.Error("migrations failed", "err", err)
		os.Exit(1)
	}

	slog.Info("migrations: OK")
}
