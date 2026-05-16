package senders

import "context"

// EvolutionAPISender adapta o upstream Evolution API à interface ModemSender.
// Em W1 é um stub: Send retorna resultado fixo. Card 005 (dispatcher) conecta o
// callsite real. A lógica HTTP de sendViaEvolution (sender.go) permanece intacta.
type EvolutionAPISender struct {
	instanceURL string
	apiKey      string
}

// NewEvolutionAPISender constrói um EvolutionAPISender com URL de instância e chave.
func NewEvolutionAPISender(url, key string) *EvolutionAPISender {
	return &EvolutionAPISender{instanceURL: url, apiKey: key}
}

// ID implementa ModemSender.
func (e *EvolutionAPISender) ID() string { return "evolution_api" }

// Send implementa ModemSender.
// W1: stub — retorna resposta fixa. W2+ delega para helper HTTP extraído de sender.go.
func (e *EvolutionAPISender) Send(_ context.Context, _ SendPayload) (*SendResult, error) {
	return &SendResult{MessageID: "stub-evolution", SentAt: ""}, nil
}
