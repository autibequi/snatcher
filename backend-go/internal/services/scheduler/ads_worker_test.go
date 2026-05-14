package scheduler

import (
	"testing"
	"time"

	"snatcher/backendv2/internal/models"

	"github.com/robfig/cron/v3"
)

func TestAdShouldFireNow_EveryMinute(t *testing.T) {
	sched := mustParse(t, "* * * * *")
	loc := time.UTC
	now := time.Date(2026, 3, 15, 14, 30, 45, 0, loc)

	if !adShouldFireNow(sched, loc, now, models.NullTime{}) {
		t.Fatal("expected fire on every-minute cron")
	}
	last := models.NewNullTime(time.Date(2026, 3, 15, 14, 30, 10, 0, loc))
	if adShouldFireNow(sched, loc, now, last) {
		t.Fatal("should not fire twice same calendar minute")
	}
}

func TestAdShouldFireNow_Hourly(t *testing.T) {
	sched := mustParse(t, "0 * * * *")
	loc := time.UTC

	onHour := time.Date(2026, 3, 15, 14, 0, 0, 0, loc)
	if !adShouldFireNow(sched, loc, onHour, models.NullTime{}) {
		t.Fatal("expected fire at :00")
	}

	offHour := time.Date(2026, 3, 15, 14, 15, 0, 0, loc)
	if adShouldFireNow(sched, loc, offHour, models.NullTime{}) {
		t.Fatal("should not fire at :15")
	}
}

func mustParse(t *testing.T, spec string) cron.Schedule {
	t.Helper()
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	s, err := parser.Parse(spec)
	if err != nil {
		t.Fatalf("parse %q: %v", spec, err)
	}
	return s
}
