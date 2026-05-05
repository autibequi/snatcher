package messaging

import (
	"context"
	"time"
)

type Platform string

const (
	PlatformWhatsApp Platform = "whatsapp"
	PlatformTelegram Platform = "telegram"
)

type Session struct {
	ID        string
	AccountID int64
	Status    string // connected, qr_pending, disconnected
	QRCode    string // base64, só quando qr_pending
}

type Target struct {
	GroupID  int64
	RemoteID string // JID (WA) ou chat_id (TG)
	Platform Platform
}

type Media struct {
	URL      string
	Filename string
	MimeType string
}

type SendOpts struct {
	DelayMs int
}

type MessageRef struct {
	Provider string
	RemoteID string
	SentAt   time.Time
}

type Health struct {
	AccountID  int64
	Status     string
	SentToday  int
	DailyLimit int
}

type EventType string

const (
	EventStatusChanged EventType = "status_changed"
	EventQRCode        EventType = "qr_code"
)

type Event struct {
	Type      EventType
	AccountID int64
	Status    string
	QRCode    string
}

type EventHandler func(event Event)

// Gateway é a interface de provedor de mensageria (WA/TG).
type Gateway interface {
	Platform() Platform
	Connect(ctx context.Context, accountID int64, opts map[string]string) (Session, error)
	Disconnect(ctx context.Context, sessionID string) error
	SendText(ctx context.Context, target Target, text string, opts SendOpts) (MessageRef, error)
	SendMedia(ctx context.Context, target Target, media Media, caption string, opts SendOpts) (MessageRef, error)
	Health(ctx context.Context, accountID int64) (Health, error)
	Subscribe(ctx context.Context, accountID int64, h EventHandler) error
}
