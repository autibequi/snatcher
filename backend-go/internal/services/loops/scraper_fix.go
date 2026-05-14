package loops

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunScraperFix detecta scrapers com drift via mv_scraper_health e propõe novo seletor.
// Versão inicial: detecta drift e cria llm_suggestions; LLM proposal real é stub.
func RunScraperFix(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	type drift struct {
		SourceID    string  `db:"source_id"`
		Field       string  `db:"field"`
		Attempts    int     `db:"attempts"`
		SuccessRate float64 `db:"success_rate"`
	}
	var drifts []drift
	if err := db.SelectContext(ctx, &drifts, `
		SELECT source_id, field, attempts, COALESCE(success_rate, 0) AS success_rate
		FROM mv_scraper_health
		WHERE attempts >= 5 AND COALESCE(success_rate, 0) < 0.30
	`); err != nil {
		return err
	}

	for _, d := range drifts {
		// Em modo active: criaria scraper_configs novo com status='shadow'.
		// Por ora: registra sugestão para curador humano.
		var configID int64
		err := db.GetContext(ctx, &configID, "SELECT id FROM scraper_configs WHERE source_id=$1 AND field=$2 AND status='active'", d.SourceID, d.Field)
		if err != nil {
			continue
		}
		_ = Suggest(ctx, db, "scraper_fix", "scraper_configs", configID,
			"Scraper drift detected — selector needs review",
			map[string]any{"current_success_rate": d.SuccessRate, "attempts": d.Attempts, "action": "review_selector"},
			"Success rate < 30% over 5+ attempts in last 1h", 0.85)
		slog.Warn("scraper_fix: drift detected", "source_id", d.SourceID, "field", d.Field, "rate", d.SuccessRate)
	}
	return nil
}
