package main

import (
	"log/slog"
	"os"

	appdb "snatcher/backendv2/internal/db"
	"snatcher/backendv2/internal/config"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config validation failed", "err", err)
		os.Exit(1)
	}

	db, err := appdb.Open(cfg.DatabaseURL)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		slog.Error("migrations failed", "err", err)
		os.Exit(1)
	}

	slog.Info("migrations applied successfully")
}
