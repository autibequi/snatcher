package senders

import "context"

// IPModemSenderStub é um placeholder para integração futura com modems IP diretos.
// Retorna ErrModemNotImplemented em toda chamada Send — fora do escopo W1.
type IPModemSenderStub struct {
	ip string
}

// NewIPModemSenderStub constrói o stub com o endereço IP do modem.
func NewIPModemSenderStub(ip string) *IPModemSenderStub {
	return &IPModemSenderStub{ip: ip}
}

// ID implementa ModemSender.
func (s *IPModemSenderStub) ID() string { return "ip_modem_stub:" + s.ip }

// Send implementa ModemSender — sempre retorna ErrModemNotImplemented.
func (s *IPModemSenderStub) Send(_ context.Context, _ SendPayload) (*SendResult, error) {
	return nil, ErrModemNotImplemented
}
