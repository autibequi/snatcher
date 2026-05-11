package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strings"
	"time"
)

// MessageSender é a interface que os adapters de mensagem implementam.
type MessageSender interface {
	SendText(ctx context.Context, chatID, text string) error
	SendImage(ctx context.Context, chatID, imageURL, caption string) error
	Provider() string
}

// AdapterRegistry mapeia provider → adapter.
type AdapterRegistry map[string]MessageSender

const defaultTemplate = "🔥 *{title}*\n💰 R$ {price:.2f}\n🔗 {url}"

type eventType string

const (
	eventNew    eventType = "new"
	eventDrop   eventType = "drop"
	eventLowest eventType = "lowest"
)

// EvaluateAndSend detecta eventos e envia mensagens para os canais configurados.
func EvaluateAndSend(ctx context.Context, st store.Store, adapters AdapterRegistry) error {
	since := time.Now().Add(-35 * time.Minute) // janela do último ciclo de crawl
	products, err := st.GetRecentlyUpdatedProducts(since)
	if err != nil {
		return err
	}
	if len(products) == 0 {
		return nil
	}

	channels, err := st.ListChannels()
	if err != nil {
		return err
	}

	now := time.Now()
	for _, ch := range channels {
		if !ch.Active {
			continue
		}
		if !inSendWindow(now, ch.SendStartHour, ch.SendEndHour) {
			continue
		}

		auto, err := st.GetChannelAutomation(ch.ID)
		if err != nil {
			continue
		}
		if auto == nil || !auto.Enabled || !auto.EventsEnabled {
			continue
		}
		if auto.PausedUntil.Valid && auto.PausedUntil.Time.After(now) {
			continue
		}
		targets, err := st.ListChannelTargets(ch.ID)
		if err != nil {
			continue
		}

		for _, p := range products {
			variants, _ := st.ListVariantsByProduct(p.ID)
			event := detectEvent(st, p, variants, since)
			if event == "" {
				continue
			}

			if !automationMatches(*auto, p, event) {
				continue
			}

			msg := formatMessage(ch, p, variants, event)

			for _, target := range targets {
				if target.Status != "ok" {
					continue
				}
				wasSent, _ := st.WasSentRecently(p.ID, target.ID, since)
				if wasSent {
					continue
				}

				adapter, ok := adapters[target.Provider]
				if !ok {
					continue
				}

				var sendErr error
				if p.ImageURL.Valid && p.ImageURL.String != "" {
					sendErr = adapter.SendImage(ctx, target.ChatID, p.ImageURL.String, msg)
				} else {
					sendErr = adapter.SendText(ctx, target.ChatID, msg)
				}

				if sendErr != nil {
					slog.Error("send message", "provider", target.Provider, "chat_id", target.ChatID, "err", sendErr)
					continue
				}

				_ = st.RecordSent(models.SentMessageV2{
					CatalogProductID: p.ID,
					ChannelTargetID:  target.ID,
					IsDrop:           event == eventDrop,
				})
			}
		}
	}
	return nil
}

func detectEvent(st store.Store, p models.CatalogProduct, variants []models.CatalogVariant, since time.Time) eventType {
	for _, v := range variants {
		if v.FirstSeenAt.After(since) {
			return eventNew
		}
	}

	for _, v := range variants {
		hist, err := st.ListPriceHistoryV2(v.ID)
		if err != nil || len(hist) < 2 {
			continue
		}
		prev := hist[1].Price
		curr := hist[0].Price
		if prev > 0 && (prev-curr)/prev >= 0.10 {
			return eventDrop
		}
	}

	if p.LowestPrice.Valid {
		for _, v := range variants {
			hist, _ := st.ListPriceHistoryV2(v.ID)
			if len(hist) >= 2 && hist[0].Price < hist[1].Price {
				return eventLowest
			}
		}
	}

	return ""
}

func automationMatches(auto models.ChannelAutomation, p models.CatalogProduct, event eventType) bool {
	switch event {
	case eventNew:
		if !auto.NotifyNew {
			return false
		}
	case eventDrop:
		if !auto.NotifyDrop {
			return false
		}
	case eventLowest:
		if !auto.NotifyLowest {
			return false
		}
	}

	switch auto.MatchType {
	case "all", "":
		// sem filtro adicional
	case "tag":
		if !auto.MatchValue.Valid {
			return false
		}
		for _, tag := range p.GetTags() {
			if tag == auto.MatchValue.String {
				return true
			}
		}
		return false
	case "brand":
		if !auto.MatchValue.Valid || !p.Brand.Valid {
			return false
		}
		if !strings.EqualFold(p.Brand.String, auto.MatchValue.String) {
			return false
		}
	}

	if auto.MaxPrice.Valid && p.LowestPrice.Valid && p.LowestPrice.Float64 > auto.MaxPrice.Float64 {
		return false
	}

	return true
}

func formatMessage(ch models.Channel, p models.CatalogProduct, variants []models.CatalogVariant, event eventType) string {
	tpl := defaultTemplate
	if ch.MessageTemplate.Valid && ch.MessageTemplate.String != "" {
		tpl = ch.MessageTemplate.String
	}

	var bestURL string
	if p.LowestPriceURL.Valid {
		bestURL = p.LowestPriceURL.String
	} else if len(variants) > 0 {
		bestURL = variants[0].URL
	}

	var price float64
	if p.LowestPrice.Valid {
		price = p.LowestPrice.Float64
	}

	badge := ""
	switch event {
	case eventDrop:
		badge = "📉 "
	case eventLowest:
		badge = "🏆 "
	}

	cleanTitle := BeautifyTitle(p.CanonicalName, 60)
	msg := tpl
	msg = strings.ReplaceAll(msg, "{title}", badge+cleanTitle)
	msg = strings.ReplaceAll(msg, "{price:.2f}", fmt.Sprintf("%.2f", price))
	msg = strings.ReplaceAll(msg, "{price}", fmt.Sprintf("%.2f", price))
	msg = strings.ReplaceAll(msg, "{url}", bestURL)
	return msg
}

// inSendWindow delega pra scheduler.IsHourInWindow pra garantir semântica única.
// Mantido aqui como helper local pra não exigir import cycle reverso.
func inSendWindow(t time.Time, startHour, endHour int) bool {
	if startHour == endHour {
		return true
	}
	h := t.Hour()
	if startHour < endHour {
		return h >= startHour && h < endHour
	}
	return h >= startHour || h < endHour
}
