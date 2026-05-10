package scheduler

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/robfig/cron/v3"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// RunAdsWorker avalia anúncios recorrentes (schedule_cron) e cria dispatches na fila WA.
func RunAdsWorker(ctx context.Context, st store.Store) {
	select {
	case <-ctx.Done():
		return
	default:
	}

	cfg, err := st.GetConfig()
	if err != nil {
		slog.Error("ads worker: get config", "err", err)
		return
	}

	loc := adsCronLocation()
	ads, err := st.ListAds(true)
	if err != nil {
		slog.Error("ads worker: list ads", "err", err)
		return
	}

	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	now := time.Now()

	for _, ad := range ads {
		if !ad.IsActiveNow() {
			continue
		}

		sched, err := parser.Parse(ad.ScheduleCron)
		if err != nil {
			slog.Warn("ads worker: cron inválido — ignorando anúncio", "ad_id", ad.ID, "cron", ad.ScheduleCron, "err", err)
			continue
		}

		if !adShouldFireNow(sched, loc, now, ad.LastDispatchedAt) {
			continue
		}

		if strings.TrimSpace(ad.MessageText) == "" {
			slog.Warn("ads worker: mensagem vazia — pulando", "ad_id", ad.ID)
			continue
		}

		targets := resolveAdTargets(st, ad)
		if len(targets) == 0 {
			slog.Warn("ads worker: sem grupos alvo — pulando", "ad_id", ad.ID, "name", ad.Name)
			continue
		}

		msgMap := map[string]any{"text": ad.MessageText}
		if ad.ImageURL.Valid && ad.ImageURL.String != "" {
			msgMap["media_url"] = ad.ImageURL.String
		}
		msgBytes, err := json.Marshal(msgMap)
		if err != nil {
			slog.Error("ads worker: marshal message", "ad_id", ad.ID, "err", err)
			continue
		}

		affiliate := ad.TargetURL

		dispatchStatus := "queued"
		if !cfg.FullAutoMode {
			dispatchStatus = "pending_approval"
		}

		d := models.Dispatch{
			ComposedBy:    "scheduled-ad",
			Message:       msgBytes,
			AffiliateLink: affiliate,
			Status:        dispatchStatus,
		}

		dispatchID, err := st.CreateDispatch(d, targets)
		if err != nil {
			slog.Error("ads worker: create dispatch", "ad_id", ad.ID, "err", err)
			continue
		}
		if err := st.MarkAdDispatched(ad.ID); err != nil {
			slog.Warn("ads worker: mark dispatched", "ad_id", ad.ID, "dispatch_id", dispatchID, "err", err)
		}
		slog.Info("ads worker: criado dispatch",
			"ad_id", ad.ID,
			"name", ad.Name,
			"dispatch_id", dispatchID,
			"targets", len(targets),
			"status", dispatchStatus,
		)
	}
}

func adsCronLocation() *time.Location {
	name := os.Getenv("SNATCHER_ADS_CRON_TZ")
	if name == "" {
		name = "America/Sao_Paulo"
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		slog.Warn("ads worker: timezone inválido, usando UTC", "tz", name, "err", err)
		return time.UTC
	}
	return loc
}

// adShouldFireNow é true se o instante atual (truncado ao minuto em loc) é um tick do schedule
// e ainda não disparámos neste mesmo minuto de calendário (evita duplicar no mesmo ciclo do worker).
func adShouldFireNow(sched cron.Schedule, loc *time.Location, now time.Time, last models.NullTime) bool {
	now = now.In(loc)
	t0 := now.Truncate(time.Minute)

	if last.Valid {
		ld := last.Time.In(loc).Truncate(time.Minute)
		if ld.Equal(t0) {
			return false
		}
	}

	prev := t0.Add(-time.Nanosecond)
	nextHit := sched.Next(prev)
	nh := nextHit.In(loc).Truncate(time.Minute)
	return nh.Equal(t0)
}

func resolveAdTargets(st store.Store, ad models.Ad) []models.DispatchTarget {
	seen := make(map[int64]struct{})
	var out []models.DispatchTarget

	if len(ad.GroupIDs) > 0 {
		for _, gid := range ad.GroupIDs {
			if gid <= 0 {
				continue
			}
			if _, dup := seen[gid]; dup {
				continue
			}
			if _, err := st.GetRedesignGroup(gid); err != nil {
				slog.Warn("ads worker: grupo não encontrado", "group_id", gid, "ad_id", ad.ID)
				continue
			}
			seen[gid] = struct{}{}
			out = append(out, models.DispatchTarget{GroupID: gid})
		}
		return out
	}

	for _, cid := range ad.ChannelIDs {
		if cid <= 0 {
			continue
		}
		groups, err := st.ListRedesignGroups(cid, "", "active")
		if err != nil {
			slog.Warn("ads worker: list groups", "channel_id", cid, "ad_id", ad.ID, "err", err)
			continue
		}
		for _, g := range groups {
			if _, dup := seen[g.ID]; dup {
				continue
			}
			seen[g.ID] = struct{}{}
			out = append(out, models.DispatchTarget{GroupID: g.ID})
		}
	}
	return out
}
