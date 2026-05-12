package jobs

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunCacheImages baixa image_url de catalog items que ainda não foram cacheados.
// Armazenamento: filesystem local (CACHE_IMAGES_DIR env, default /var/lib/snatcher/images).
// Limite por execução: 100 imagens.
// NOTA OPERACIONAL: requer volume montado em /var/lib/snatcher/images (ou CACHE_IMAGES_DIR).
// Ver RUNBOOK para instruções de configuração do volume em produção.
func RunCacheImages(ctx context.Context, db *sqlx.DB) error {
	dir := os.Getenv("CACHE_IMAGES_DIR")
	if dir == "" {
		dir = "/var/lib/snatcher/images"
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	type row struct {
		ID  int64  `db:"id"`
		URL string `db:"image_url"`
	}
	var rows []row
	if err := db.SelectContext(ctx, &rows, `
		SELECT id, image_url FROM catalog
		WHERE image_url IS NOT NULL AND cached_image_path IS NULL AND send_ready = true
		ORDER BY send_ready_at DESC LIMIT 100
	`); err != nil {
		return err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	saved := 0
	for _, r := range rows {
		req, err := http.NewRequestWithContext(ctx, "GET", r.URL, nil)
		if err != nil {
			continue
		}
		resp, err := client.Do(req)
		if err != nil || resp.StatusCode != 200 {
			if resp != nil {
				resp.Body.Close()
			}
			continue
		}
		h := sha256.New()
		body, err := io.ReadAll(io.TeeReader(resp.Body, h))
		resp.Body.Close()
		if err != nil {
			continue
		}
		hash := fmt.Sprintf("%x", h.Sum(nil))
		path := filepath.Join(dir, hash[:2], hash+".bin")
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			continue
		}
		if err := os.WriteFile(path, body, 0644); err != nil {
			continue
		}
		_, _ = db.ExecContext(ctx, "UPDATE catalog SET cached_image_path=$1, cached_image_at=now() WHERE id=$2", path, r.ID)
		saved++
	}
	slog.Info("cache_images: done", "saved", saved, "candidates", len(rows))
	return nil
}
