package pipeline

import (
	"context"
	"log/slog"
	"snatcher/backendv2/internal/store"
)

// Runner orquestra as 3 etapas do pipeline.
type Runner struct {
	store    store.Store
	scrapers map[string]Scraper
	adapters AdapterRegistry
}

func NewRunner(st store.Store, scrapers map[string]Scraper, adapters AdapterRegistry) *Runner {
	return &Runner{store: st, scrapers: scrapers, adapters: adapters}
}

// Run executa o pipeline completo: crawl → process → evaluate.
// Cada etapa é executada mesmo que a anterior falhe (best-effort), mas
// o primeiro erro encontrado é propagado para o caller — sem isso o
// scheduler nunca distingue uma rodada saudável de uma totalmente quebrada.
func (r *Runner) Run(ctx context.Context) error {
	var firstErr error

	slog.Info("pipeline: start crawl")
	if err := CrawlAllTerms(ctx, r.store, r.scrapers); err != nil {
		slog.Error("pipeline: crawl", "err", err)
		firstErr = err
	}

	slog.Info("pipeline: start process")
	if err := ProcessCrawlResults(ctx, r.store); err != nil {
		slog.Error("pipeline: process", "err", err)
		if firstErr == nil {
			firstErr = err
		}
	}

	slog.Info("pipeline: start evaluate")
	if err := EvaluateAndSend(ctx, r.store, r.adapters); err != nil {
		slog.Error("pipeline: evaluate", "err", err)
		if firstErr == nil {
			firstErr = err
		}
	}

	slog.Info("pipeline: done", "ok", firstErr == nil)
	return firstErr
}
