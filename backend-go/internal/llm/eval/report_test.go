package eval

import (
	"strings"
	"testing"
)

func TestHTMLReport(t *testing.T) {
	results := []Result{
		{CaseName: "test1", Passed: true, Score: 0.95, LatencyMs: 100},
		{CaseName: "test2", Passed: false, Score: 0.5, LatencyMs: 200, Error: "schema invalid"},
	}
	html := HTMLReport(results, "Test Report")

	tests := []string{
		"<!DOCTYPE html",
		"Test Report",
		"test1",
		"test2",
		"PASS",
		"FAIL",
		"1/2", // 1 passed out of 2
	}

	for _, test := range tests {
		if !strings.Contains(html, test) {
			t.Errorf("expected HTML to contain %q", test)
		}
	}
}

func TestTextReport(t *testing.T) {
	results := []Result{
		{CaseName: "test1", Passed: true, Score: 0.95, LatencyMs: 100},
		{CaseName: "test2", Passed: false, Score: 0.5, LatencyMs: 200},
	}
	text := TextReport(results)

	tests := []string{
		"[PASS]",
		"[FAIL]",
		"test1",
		"test2",
		"1/2 passed",
	}

	for _, test := range tests {
		if !strings.Contains(text, test) {
			t.Errorf("expected text to contain %q", test)
		}
	}
}

func TestComputeStats(t *testing.T) {
	results := []Result{
		{CaseName: "a", Passed: true, Score: 1.0, LatencyMs: 50},
		{CaseName: "b", Passed: true, Score: 0.8, LatencyMs: 100},
		{CaseName: "c", Passed: false, Score: 0.5, LatencyMs: 200},
	}
	stats := ComputeStats(results)

	if stats.Total != 3 {
		t.Errorf("expected Total=3, got %d", stats.Total)
	}
	if stats.Passed != 2 {
		t.Errorf("expected Passed=2, got %d", stats.Passed)
	}
	if stats.Failed != 1 {
		t.Errorf("expected Failed=1, got %d", stats.Failed)
	}
	if stats.AvgScore < 0.75 || stats.AvgScore > 0.77 {
		t.Errorf("expected AvgScore≈0.76, got %f", stats.AvgScore)
	}
	if stats.TotalLatency != 350 {
		t.Errorf("expected TotalLatency=350, got %d", stats.TotalLatency)
	}
}

func TestComputeStats_Empty(t *testing.T) {
	stats := ComputeStats([]Result{})
	if stats.Total != 0 {
		t.Errorf("expected Total=0 for empty results")
	}
}
