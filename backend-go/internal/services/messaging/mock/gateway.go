package mock

import (
	"context"
	"sync"
	"time"

	"snatcher/backendv2/internal/services/messaging"
)

type Gateway struct {
	mu       sync.Mutex
	Messages []SentMessage
	Fail     bool // se true, SendText/SendMedia retornam erro
}

type SentMessage struct {
	Target   messaging.Target
	Text     string
	MediaURL string
	SentAt   time.Time
}

func New() *Gateway { return &Gateway{} }

func (g *Gateway) Platform() messaging.Platform { return messaging.PlatformWhatsApp }

func (g *Gateway) Connect(_ context.Context, accountID int64, _ map[string]string) (messaging.Session, error) {
	return messaging.Session{ID: "mock", AccountID: accountID, Status: "connected"}, nil
}

func (g *Gateway) Disconnect(_ context.Context, _ string) error { return nil }

func (g *Gateway) SendText(_ context.Context, target messaging.Target, text string, _ messaging.SendOpts) (messaging.MessageRef, error) {
	if g.Fail {
		return messaging.MessageRef{}, messaging.ErrNotConnected
	}
	g.mu.Lock()
	g.Messages = append(g.Messages, SentMessage{Target: target, Text: text, SentAt: time.Now()})
	g.mu.Unlock()
	return messaging.MessageRef{Provider: "mock", RemoteID: target.RemoteID, SentAt: time.Now()}, nil
}

func (g *Gateway) SendMedia(_ context.Context, target messaging.Target, media messaging.Media, caption string, _ messaging.SendOpts) (messaging.MessageRef, error) {
	if g.Fail {
		return messaging.MessageRef{}, messaging.ErrNotConnected
	}
	g.mu.Lock()
	g.Messages = append(g.Messages, SentMessage{Target: target, MediaURL: media.URL, Text: caption, SentAt: time.Now()})
	g.mu.Unlock()
	return messaging.MessageRef{Provider: "mock", RemoteID: target.RemoteID}, nil
}

func (g *Gateway) Health(_ context.Context, accountID int64) (messaging.Health, error) {
	return messaging.Health{AccountID: accountID, Status: "connected"}, nil
}

func (g *Gateway) Subscribe(_ context.Context, _ int64, _ messaging.EventHandler) error { return nil }
