package scheduler

import "testing"

func TestEvolutionSendBodyError(t *testing.T) {
	if evolutionSendBodyError([]byte(`{"key":{}}`)) != "" {
		t.Fatal("success shape must not be error")
	}
	if e := evolutionSendBodyError([]byte(`{"error":"not authorized"}`)); e != "not authorized" {
		t.Fatalf("want error string, got %q", e)
	}
	if e := evolutionSendBodyError([]byte(`{"status":500,"message":"broken"}`)); e != "broken" {
		t.Fatalf("want message from status>=400 JSON, got %q", e)
	}
}
