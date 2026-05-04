package eval

import (
	"context"
	"testing"

	"snatcher/backendv2/internal/prompts"
)

func TestRunner_MockClient(t *testing.T) {
	reg := prompts.NewRegistry()
	runner := NewMockRunner(reg)

	cases := DefaultCases()
	results := runner.Run(context.Background(), cases)

	for _, r := range results {
		if !r.Passed {
			t.Errorf("case %s failed: score=%.2f error=%s output=%s",
				r.CaseName, r.Score, r.Error, r.Output)
		}
	}
}

func TestReport(t *testing.T) {
	results := []Result{
		{CaseName: "a", Passed: true, Score: 1.0, LatencyMs: 100},
		{CaseName: "b", Passed: false, Score: 0.5, LatencyMs: 200, Error: "schema invalid"},
	}
	report := Report(results)
	if report == "" {
		t.Error("expected non-empty report")
	}
	if len(report) < 20 {
		t.Error("report too short")
	}
}
