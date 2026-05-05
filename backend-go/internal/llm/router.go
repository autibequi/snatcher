package llm

import "encoding/json"

var defaultModels = map[string]string{
	"query_expansion": "openai/gpt-4o-mini",
	"triage":          "openai/gpt-4o-mini",
	"creative":        "anthropic/claude-3.5-sonnet",
	"compose":         "anthropic/claude-3.5-sonnet",
	"cluster_label":   "anthropic/claude-3.5-sonnet",
	"parse_offer":     "openai/gpt-4o-mini",
	"reasoning":       "openai/o1-mini",
	"embedding":       "openai/text-embedding-3-small",
}

type ModelRouter struct {
	overrides map[string]string
}

func NewModelRouter(overridesJSON string) *ModelRouter {
	overrides := map[string]string{}
	if overridesJSON != "" && overridesJSON != "{}" {
		_ = json.Unmarshal([]byte(overridesJSON), &overrides)
	}
	return &ModelRouter{overrides: overrides}
}

func (r *ModelRouter) ModelFor(operation string) string {
	if m, ok := r.overrides[operation]; ok {
		return m
	}
	if m, ok := defaultModels[operation]; ok {
		return m
	}
	return "openai/gpt-4o-mini"
}

// Route retorna Options com o modelo correto para a operação.
func (r *ModelRouter) Route(operation string, base Options) Options {
	if base.Model == "" {
		base.Model = r.ModelFor(operation)
	}
	base.Operation = operation
	return base
}
