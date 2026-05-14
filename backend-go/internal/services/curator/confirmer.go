package curator

import (
	"context"
	"sync"
	"time"
)

// PendingAction representa uma ação aguardando confirmação humana.
type PendingAction struct {
	GroupJID  string
	Action    Intent
	ExpiresAt time.Time
}

// Confirmer mantém estado in-memory de ações pendentes (TTL 60s).
type Confirmer struct {
	mu      sync.Mutex
	pending map[string]PendingAction // key = grupo JID
}

// NewConfirmer cria um Confirmer vazio.
func NewConfirmer() *Confirmer {
	return &Confirmer{pending: make(map[string]PendingAction)}
}

// Stage registra uma pending action que expira em 60s.
func (c *Confirmer) Stage(jid string, intent Intent) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pending[jid] = PendingAction{
		GroupJID:  jid,
		Action:    intent,
		ExpiresAt: time.Now().Add(60 * time.Second),
	}
}

// TryConfirm retorna a ação pendente se ela existe e ainda é válida, depois remove.
func (c *Confirmer) TryConfirm(jid string) (Intent, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	p, ok := c.pending[jid]
	if !ok || time.Now().After(p.ExpiresAt) {
		delete(c.pending, jid)
		return Intent{}, false
	}
	delete(c.pending, jid)
	return p.Action, true
}

// Gc remove ações expiradas. Chamar periodicamente (cron 1min).
func (c *Confirmer) Gc(_ context.Context) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for k, p := range c.pending {
		if now.After(p.ExpiresAt) {
			delete(c.pending, k)
		}
	}
}
