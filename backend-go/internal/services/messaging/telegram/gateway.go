// Package telegram fornece um stub pluggável da interface messaging.Gateway para Telegram.
//
// stub pluggável — implementar Baileys/Telethon bridge quando Fase 17 for executada
// (sub06-fase17-spy-crawlers-clusters). Para envio real de mensagens Telegram, use
// internal/services/adapters.TelegramAdapter que já está funcional.
package telegram

import (
	"context"
	"fmt"

	"snatcher/backendv2/internal/services/messaging"
)

// Gateway implementa messaging.Gateway para Telegram (stub).
// Todos os métodos retornam erro "not implemented" até a Fase 17.
type Gateway struct {
	BotToken string
}

// NewGateway cria um stub do Gateway Telegram com o token configurado.
func NewGateway(botToken string) *Gateway {
	return &Gateway{BotToken: botToken}
}

func (g *Gateway) Platform() messaging.Platform { return messaging.PlatformTelegram }

func (g *Gateway) Connect(_ context.Context, _ int64, _ map[string]string) (messaging.Session, error) {
	return messaging.Session{}, fmt.Errorf("telegram gateway: %w", messaging.ErrNotImplemented)
}

func (g *Gateway) Disconnect(_ context.Context, _ string) error {
	return fmt.Errorf("telegram gateway: %w", messaging.ErrNotImplemented)
}

func (g *Gateway) SendText(_ context.Context, _ messaging.Target, _ string, _ messaging.SendOpts) (messaging.MessageRef, error) {
	return messaging.MessageRef{}, fmt.Errorf("telegram gateway: %w", messaging.ErrNotImplemented)
}

func (g *Gateway) SendMedia(_ context.Context, _ messaging.Target, _ messaging.Media, _ string, _ messaging.SendOpts) (messaging.MessageRef, error) {
	return messaging.MessageRef{}, fmt.Errorf("telegram gateway: %w", messaging.ErrNotImplemented)
}

func (g *Gateway) Health(_ context.Context, _ int64) (messaging.Health, error) {
	return messaging.Health{}, fmt.Errorf("telegram gateway: %w", messaging.ErrNotImplemented)
}

func (g *Gateway) Subscribe(_ context.Context, _ int64, _ messaging.EventHandler) error {
	return fmt.Errorf("telegram gateway: %w", messaging.ErrNotImplemented)
}
