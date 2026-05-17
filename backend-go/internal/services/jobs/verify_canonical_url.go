package jobs

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/httpx"
)

// RunVerifyCanonicalURL faz HEAD em catalog.canonical_url para verificar disponibilidade.
// Cron diário 04:00. Limita a 500 itens por execução (os mais antigos primeiro).
func RunVerifyCanonicalURL(ctx context.Context, db *sqlx.DB) error {
	type row struct {
		ID  int64  `db:"id"`
		URL string `db:"canonical_url"`
	}
	var items []row
	if err := db.SelectContext(ctx, &items, `
		SELECT id, canonical_url FROM catalog
		WHERE canonical_url_alive = true
		ORDER BY updated_at ASC
		LIMIT 500
	`); err != nil {
		return err
	}

	client := httpx.NewClient(5*time.Second, "snatcher-canonical-verify")
	deadCount := 0
	for _, it := range items {
		if ctx.Err() != nil {
			break
		}
		req, err := http.NewRequestWithContext(ctx, "HEAD", it.URL, nil)
		if err != nil {
			continue
		}
		resp, err := client.Do(req)
		alive := err == nil && resp.StatusCode < 400
		if resp != nil {
			resp.Body.Close()
		}
		if !alive {
			_, _ = db.ExecContext(ctx, "UPDATE catalog SET canonical_url_alive = false, updated_at = now() WHERE id = $1", it.ID)
			deadCount++
		}
	}
	slog.Info("verify_canonical_url: done", "checked", len(items), "dead", deadCount)
	return nil
}
