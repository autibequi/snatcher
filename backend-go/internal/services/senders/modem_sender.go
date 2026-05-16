package senders

import (
	"context"
	"errors"
)

var ErrModemNotImplemented = errors.New("modem sender not implemented")

// SendPayload é o input neutro de qualquer ModemSender.
type SendPayload struct {
	GroupJID    string
	MessageBody string
	MediaURL    string // opcional
	Caption     string // opcional
}

// SendResult é a resposta neutra.
type SendResult struct {
	MessageID string
	SentAt    string // ISO8601
}

// ModemSender envia mensagens via algum upstream (Evolution API, IP modem direto, etc).
type ModemSender interface {
	Send(ctx context.Context, payload SendPayload) (*SendResult, error)
	ID() string
}
