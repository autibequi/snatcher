package messaging

import "fmt"

type Registry struct {
	providers map[string]Gateway
}

func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Gateway)}
}

func (r *Registry) Register(name string, g Gateway) {
	r.providers[name] = g
}

func (r *Registry) Get(provider string) (Gateway, error) {
	g, ok := r.providers[provider]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrNotFound, provider)
	}
	return g, nil
}
