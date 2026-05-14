package pipeline

import "context"

// AdapterRegistry e EvaluateAndSend — stubs após remoção de evaluate.go em unify-v1-v2.
// O pipeline v2 usa algo/tick.go + senders/ em vez de evaluate+send.

// AdapterRegistry era o registro de adaptadores WA/TG. Com v2 (senders/), não é mais usado.
type AdapterRegistry map[string]any

// EvaluateAndSend era a terceira etapa do pipeline v1 (avalia items + envia via WA/TG).
// Substituído por algo.RunTick() + senders.StartAll(). Mantido aqui como no-op
// para não quebrar referências existentes em pipeline.go.
func EvaluateAndSend(_ context.Context, _ interface{}, _ AdapterRegistry) error {
	return nil
}
