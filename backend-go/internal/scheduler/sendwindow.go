package scheduler

import (
	"log/slog"
	"strings"
	"time"

	"snatcher/backendv2/internal/models"
)

// IsHourInWindow é a primitiva compartilhada: testa se `hour` cai dentro
// da janela [startHour, endHour) — semântica idêntica nos dois worlds.
// Janelas que cruzam meia-noite (start > end) são tratadas como union dos
// dois lados — útil pra "21h-3h".
func IsHourInWindow(hour, startHour, endHour int) bool {
	if startHour == endHour {
		return true
	}
	if startHour < endHour {
		return hour >= startHour && hour < endHour
	}
	return hour >= startHour || hour < endHour
}

// InDispatchSendWindow retorna true se o envio via Evolution pode ocorrer agora,
// usando SendStartHour/SendEndHour da AppConfig no fuso DispatchSendTimezone (IANA).
// Com DispatchSendWindowEnabled=false, sempre true (envio 24h).
func InDispatchSendWindow(cfg models.AppConfig, now time.Time) bool {
	if !cfg.DispatchSendWindowEnabled {
		return true
	}
	tzName := strings.TrimSpace(cfg.DispatchSendTimezone)
	if tzName == "" {
		tzName = "America/Sao_Paulo"
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		slog.Warn("dispatch send window: timezone inválido, usando UTC", "tz", tzName, "err", err)
		loc = time.UTC
	}
	return IsHourInWindow(now.In(loc).Hour(), cfg.SendStartHour, cfg.SendEndHour)
}
