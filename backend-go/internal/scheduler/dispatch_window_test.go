package scheduler

import (
	"testing"
	"time"

	"snatcher/backendv2/internal/models"
)

func TestInDispatchSendWindow(t *testing.T) {
	sp, _ := time.LoadLocation("America/Sao_Paulo")
	// 2026-05-09 03:00 BRT
	night := time.Date(2026, 5, 9, 3, 0, 0, 0, sp)
	// 2026-05-09 10:00 BRT
	morning := time.Date(2026, 5, 9, 10, 0, 0, 0, sp)

	cfg := models.AppConfig{
		DispatchSendWindowEnabled: true,
		DispatchSendTimezone:      "America/Sao_Paulo",
		SendStartHour:             8,
		SendEndHour:               22,
	}
	if inDispatchSendWindow(cfg, night) {
		t.Fatal("03h BRT should be outside 8–22 window")
	}
	if !inDispatchSendWindow(cfg, morning) {
		t.Fatal("10h BRT should be inside 8–22 window")
	}

	disabled := cfg
	disabled.DispatchSendWindowEnabled = false
	if !inDispatchSendWindow(disabled, night) {
		t.Fatal("window disabled → always allow")
	}
}
