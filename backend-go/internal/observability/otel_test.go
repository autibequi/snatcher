package observability

import (
	"context"
	"os"
	"testing"
)

// TestInitOTel_NoEnv_UsesStdout verifies that InitOTel succeeds and returns a
// non-nil shutdown function when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
// In that case the SDK falls back to the stdout exporter (dev/test mode).
func TestInitOTel_NoEnv_UsesStdout(t *testing.T) {
	// Ensure the env var is absent so we exercise the stdout path.
	originalEndpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	defer func() {
		if originalEndpoint != "" {
			os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", originalEndpoint)
		}
	}()

	ctx := context.Background()

	shutdown, err := InitOTel(ctx)
	if err != nil {
		t.Fatalf("InitOTel returned unexpected error: %v", err)
	}

	if shutdown == nil {
		t.Fatal("InitOTel returned nil shutdown function")
	}

	// Calling shutdown should not panic or return an error.
	if err := shutdown(ctx); err != nil {
		t.Errorf("shutdown returned unexpected error: %v", err)
	}
}

// TestOTelMetrics_RegisteredInstruments verifies that InitOTelMetrics
// populates the package-level OTel instrument variables without error.
// Uses the stdout provider initialised by InitOTel.
func TestOTelMetrics_RegisteredInstruments(t *testing.T) {
	// Ensure stdout path (no real collector needed in tests).
	os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")

	ctx := context.Background()

	shutdown, err := InitOTel(ctx)
	if err != nil {
		t.Fatalf("InitOTel error: %v", err)
	}
	defer shutdown(ctx) //nolint:errcheck

	if err := InitOTelMetrics(); err != nil {
		t.Fatalf("InitOTelMetrics returned unexpected error: %v", err)
	}

	if DispatchSendPerChannel == nil {
		t.Error("DispatchSendPerChannel is nil after InitOTelMetrics")
	}

	if LLMOpPerChannel == nil {
		t.Error("LLMOpPerChannel is nil after InitOTelMetrics")
	}
}
