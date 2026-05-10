package scheduler

import (
	"context"
	"log/slog"
	"time"

	"snatcher/backendv2/internal/curation"
	"snatcher/backendv2/internal/store"
)

// RunCurationHeuristicWorker aplica curadoria só por script (keywords + taxonomy_pattern),
// sem LLM. Avança cursor por id para esvaziar filas grandes.
func RunCurationHeuristicWorker(ctx context.Context, st store.Store, now time.Time) {
	_ = ctx
	cfg, err := st.GetConfig()
	if err != nil {
		slog.Error("curation heuristic: get config", "err", err)
		return
	}

	interval := time.Duration(curation.NormalizeHeuristicIntervalSeconds(cfg)) * time.Second
	if cfg.CurationHeuristicLastRunAt.Valid {
		if now.Sub(cfg.CurationHeuristicLastRunAt.Time) < interval {
			return
		}
	}

	batch := curation.NormalizeHeuristicBatchSize(cfg)
	products, err := st.ListCatalogProductsForHeuristicBatch(cfg.CurationHeuristicLastID, batch)
	if err != nil {
		slog.Error("curation heuristic: list batch", "err", err)
		return
	}
	if len(products) == 0 {
		if err := st.SetCurationHeuristicCheckpoint(now, cfg.CurationHeuristicLastID); err != nil {
			slog.Warn("curation heuristic: checkpoint (empty batch)", "err", err)
		}
		return
	}

	maxSeen := cfg.CurationHeuristicLastID
	applied := 0
	processed := 0

	for i := range products {
		p := &products[i]
		processed++
		_, ok, err := curation.ApplyScriptCurator(st, p, cfg)
		if err != nil {
			slog.Warn("curation heuristic: apply", "product_id", p.ID, "err", err)
			continue
		}
		if ok {
			applied++
		}
		if p.ID > maxSeen {
			maxSeen = p.ID
		}
	}

	if err := st.SetCurationHeuristicCheckpoint(now, maxSeen); err != nil {
		slog.Warn("curation heuristic: checkpoint", "err", err)
	}

	nOff, err := st.DeactivateCatalogProductsWithoutPrice()
	if err != nil {
		slog.Warn("curation heuristic: deactivate no price", "err", err)
	} else if nOff > 0 {
		slog.Info("curation heuristic: deactivated without price", "n", nOff)
	}

	slog.Info("curation heuristic: cycle",
		"processed", processed,
		"applied_changes", applied,
		"cursor_after", maxSeen,
		"batch_size", batch)
}
