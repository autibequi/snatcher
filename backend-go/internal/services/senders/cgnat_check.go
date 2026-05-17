package senders

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/httpx"
)

// RunCGNATCheck verifica IP público de cada modem ativo. Pausa 1h se IP mudou.
// Registrado no scheduler como cron */5 * * * *.
func RunCGNATCheck(ctx context.Context, db *sqlx.DB) error {
	type modem struct {
		ID       int64   `db:"id"`
		Slug     string  `db:"slug"`
		PublicIP *string `db:"public_ip"`
	}
	var modems []modem
	// HOST modem não tem IP de modem 4G — excluir do CGNAT check para evitar
	// pausas falsas por variação de IP do servidor (cloud, balanceamento de saída, CDN).
	if err := db.SelectContext(ctx, &modems, `SELECT id, slug, public_ip::text FROM modems WHERE status='active' AND slug <> 'host'`); err != nil {
		return err
	}
	client := httpx.NewClient(8*time.Second, "snatcher-cgnat-check")
	for _, m := range modems {
		// NOTA: idealmente bind à interface do modem via proxy/endpoint dedicado;
		// por ora usa ifconfig.io via interface default (suficiente para dev/staging).
		req, err := http.NewRequestWithContext(ctx, "GET", "https://ifconfig.io/ip", nil)
		if err != nil {
			slog.Warn("cgnat.request", "modem", m.Slug, "err", err)
			continue
		}
		resp, err := client.Do(req)
		if err != nil {
			slog.Warn("cgnat.fetch", "modem", m.Slug, "err", err)
			continue
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		ip := strings.TrimSpace(string(b))
		if ip == "" {
			slog.Warn("cgnat.empty_response", "modem", m.Slug)
			continue
		}
		if m.PublicIP != nil && *m.PublicIP != "" && *m.PublicIP != ip {
			// IP mudou — atualiza o registro mas NÃO pausa automaticamente.
			// A mudança de IP CGNAT não necessariamente derruba a sessão WA;
			// o worker de sender detectará falhas reais e pausará por consecutive_failures.
			// Pausar cegamente 1h gerava interrupções desnecessárias de até 1h por troca de IP.
			slog.Warn("cgnat.changed", "modem", m.Slug, "old", *m.PublicIP, "new", ip,
				"action", "apenas log — sem pausa automática; sender detecta falha real")
		} else {
			_, _ = db.ExecContext(ctx,
				`UPDATE modems SET public_ip=$1::inet WHERE id=$2 AND (public_ip IS NULL OR public_ip::text <> $1)`,
				ip, m.ID,
			)
		}
	}
	return nil
}
