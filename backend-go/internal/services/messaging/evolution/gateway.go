package evolution

import (
	"context"
	"fmt"

	"snatcher/backendv2/internal/services/messaging"
)

type Gateway struct {
	client   *Client
	instance string // nome da instância Evolution
}

func NewGateway(baseURL, apiKey, instance string) *Gateway {
	return &Gateway{
		client:   NewClient(baseURL, apiKey),
		instance: instance,
	}
}

func (g *Gateway) Platform() messaging.Platform { return messaging.PlatformWhatsApp }

func (g *Gateway) Connect(ctx context.Context, accountID int64, opts map[string]string) (messaging.Session, error) {
	inst := g.instanceName(accountID, opts)
	state, qr, err := g.client.InstanceStatus(ctx, inst)
	if err != nil {
		return messaging.Session{}, fmt.Errorf("evolution connect: %w", err)
	}
	return messaging.Session{
		ID:        inst,
		AccountID: accountID,
		Status:    state,
		QRCode:    qr,
	}, nil
}

func (g *Gateway) Disconnect(ctx context.Context, sessionID string) error {
	_, _, err := g.client.do(ctx, "DELETE",
		fmt.Sprintf("/instance/logout/%s", sessionID), nil)
	return err
}

func (g *Gateway) SendText(ctx context.Context, target messaging.Target, text string, opts messaging.SendOpts) (messaging.MessageRef, error) {
	inst := g.instance
	if err := g.client.SendText(ctx, inst, target.RemoteID, text, opts.DelayMs); err != nil {
		return messaging.MessageRef{}, err
	}
	return messaging.MessageRef{Provider: "evolution", RemoteID: target.RemoteID}, nil
}

func (g *Gateway) SendMedia(ctx context.Context, target messaging.Target, media messaging.Media, caption string, opts messaging.SendOpts) (messaging.MessageRef, error) {
	payload := map[string]any{
		"number":    target.RemoteID,
		"mediatype": "image",
		"media":     media.URL,
		"caption":   caption,
	}
	_, status, err := g.client.do(ctx, "POST",
		fmt.Sprintf("/message/sendMedia/%s", g.instance), payload)
	if err != nil || status >= 400 {
		return messaging.MessageRef{}, fmt.Errorf("evolution sendMedia: HTTP %d %w", status, err)
	}
	return messaging.MessageRef{Provider: "evolution", RemoteID: target.RemoteID}, nil
}

func (g *Gateway) Health(ctx context.Context, accountID int64) (messaging.Health, error) {
	state, _, err := g.client.InstanceStatus(ctx, g.instance)
	if err != nil {
		return messaging.Health{}, err
	}
	return messaging.Health{AccountID: accountID, Status: state}, nil
}

func (g *Gateway) Subscribe(_ context.Context, _ int64, _ messaging.EventHandler) error {
	// Evolution usa webhooks configurados no painel — subscrição push-based
	// Esta impl retorna nil; eventos chegam via webhook handler separado
	return nil
}

func (g *Gateway) instanceName(_ int64, opts map[string]string) string {
	if inst, ok := opts["instance"]; ok && inst != "" {
		return inst
	}
	return g.instance
}
