package sendwindow

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
)

var saoPaulo *time.Location

func init() {
	var err error
	saoPaulo, err = time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		saoPaulo = time.FixedZone("BRT", -3*3600)
	}
}

// InSendWindow lê send_start_hour / send_end_hour do appconfig e decide se
// a hora atual (em SP) está dentro da janela configurada.
//
// Se send_start_hour = send_end_hour ou ambos zero → janela 24h (sem restrição).
// Suporta janelas que cruzam meia-noite (ex: start=21, end=6).
//
// Fallback quando o banco falha: nega envio (conservador).
func InSendWindow(ctx context.Context, db *sqlx.DB) bool {
	var cfg struct {
		Start int `db:"send_start_hour"`
		End   int `db:"send_end_hour"`
	}
	if err := db.GetContext(ctx, &cfg,
		`SELECT send_start_hour, send_end_hour FROM appconfig LIMIT 1`); err != nil {
		// Banco indisponível — nega envio por segurança
		return false
	}

	// Sem restrição de janela configurada
	if cfg.Start == cfg.End {
		return true
	}

	h := time.Now().In(saoPaulo).Hour()

	if cfg.Start < cfg.End {
		// Janela simples: ex 6h-22h
		return h >= cfg.Start && h < cfg.End
	}
	// Janela que cruza meia-noite: ex 21h-6h
	return h >= cfg.Start || h < cfg.End
}

func minutesUntilWindowEnd(ctx context.Context, db *sqlx.DB) int {
	var cfg struct {
		Start int `db:"send_start_hour"`
		End   int `db:"send_end_hour"`
	}
	if err := db.GetContext(ctx, &cfg,
		`SELECT send_start_hour, send_end_hour FROM appconfig LIMIT 1`); err != nil {
		return 0
	}
	endHour := cfg.End
	if endHour == 0 && cfg.Start == 0 {
		// sem restrição — 24h
		return 24 * 60
	}

	now := time.Now().In(saoPaulo)
	h := now.Hour()
	var end time.Time
	if cfg.Start < cfg.End {
		// janela simples: end é hoje mesmo
		end = time.Date(now.Year(), now.Month(), now.Day(), endHour, 0, 0, 0, saoPaulo)
		if h < cfg.Start || h >= cfg.End {
			return 0
		}
	} else {
		// janela cruzando meia-noite
		if h >= cfg.Start {
			// avança até end do dia seguinte
			end = time.Date(now.Year(), now.Month(), now.Day()+1, endHour, 0, 0, 0, saoPaulo)
		} else if h < cfg.End {
			end = time.Date(now.Year(), now.Month(), now.Day(), endHour, 0, 0, 0, saoPaulo)
		} else {
			return 0
		}
	}
	return int(end.Sub(now).Minutes())
}
