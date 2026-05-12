package observability

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// Beat registra ou atualiza o heartbeat de um componente em component_heartbeat.
// metadata pode ser nil — será gravado como '{}' no banco.
func Beat(ctx context.Context, db *sqlx.DB, componentName string, metadata map[string]any) {
	metaJSON := "{}"
	if len(metadata) > 0 {
		b, err := json.Marshal(metadata)
		if err != nil {
			slog.Warn("heartbeat: marshal metadata", "component", componentName, "err", err)
		} else {
			metaJSON = string(b)
		}
	}

	_, err := db.ExecContext(ctx, `
		INSERT INTO component_heartbeat (name, last_beat, metadata)
		VALUES ($1, now(), $2::jsonb)
		ON CONFLICT (name) DO UPDATE
		    SET last_beat = EXCLUDED.last_beat,
		        metadata  = EXCLUDED.metadata
	`, componentName, metaJSON)
	if err != nil {
		slog.Error("heartbeat: upsert falhou", "component", componentName, "err", err)
	}
}

// BeatLoop inicia uma goroutine que chama Beat a cada interval.
// A goroutine para quando ctx for cancelado.
// Uso: go BeatLoop(ctx, db, "algo", 30*time.Second, nil)
func BeatLoop(ctx context.Context, db *sqlx.DB, componentName string, interval time.Duration, metadata map[string]any) {
	go func() {
		// Bate imediatamente no início
		Beat(ctx, db, componentName, metadata)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				slog.Info("heartbeat: loop encerrado", "component", componentName)
				return
			case <-ticker.C:
				Beat(ctx, db, componentName, metadata)
			}
		}
	}()
}
