package ws

import (
	"testing"
	"time"
)

func TestHub_RegisterUnregister(t *testing.T) {
	h := NewHub()
	ch := h.Register("client1")
	if ch == nil {
		t.Fatal("expected channel")
	}

	h.Broadcast(Event{Type: "test", Data: "hello"})

	select {
	case ev := <-ch:
		if ev.Type != "test" {
			t.Errorf("expected 'test', got %s", ev.Type)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for event")
	}

	h.Unregister("client1")
	// não deve panic após unregister
	h.Broadcast(Event{Type: "after-unregister"})
}
