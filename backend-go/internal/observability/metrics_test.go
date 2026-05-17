package observability

import (
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// newTestRegistry returns a fresh Prometheus registry and registers all
// snatcher metrics into it. Using a dedicated registry isolates tests from the
// global default registry and avoids "already registered" panics when tests run
// in the same process as other packages that call MustRegisterAll.
func newTestRegistry(t *testing.T) *prometheus.Registry {
	t.Helper()
	reg := prometheus.NewRegistry()
	reg.MustRegister(
		HTTPRequestDuration,
		HTTPRequestsTotal,
		ScraperRuns,
		ScraperResults,
		ChannelSends,
		JobRuns,
		DBQueryDuration,
		LLMRequests,
		LLMTokensUsed,
		LLMCostUSD,
		DispatchSendDurationSeconds,
		CircuitBreakerState,
		LLMCostUSDToday,
		DispatchTotal,
		BanTotal,
		QueueDepth,
		LLMClassificationPendingReview,
	)
	return reg
}

// TestMustRegisterAll_NoError verifies that all package-level metric vars are
// valid Prometheus collectors and can be registered without panic.
// Uses a fresh registry to avoid conflicts with the global default registry.
func TestMustRegisterAll_NoError(t *testing.T) {
	// newTestRegistry panics (via MustRegister) if any collector is invalid.
	// The test passes if no panic occurs.
	_ = newTestRegistry(t)
}

// TestDispatchTotal_Increment verifies that the DispatchTotal counter
// increments correctly for a given status label.
func TestDispatchTotal_Increment(t *testing.T) {
	reg := newTestRegistry(t)

	DispatchTotal.WithLabelValues("ok").Add(3)

	families, err := reg.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	family := findFamily(families, "snatcher_dispatch_total")
	if family == nil {
		t.Fatal("metric family snatcher_dispatch_total not found")
	}

	got := sumCounterValues(family, "status", "ok")
	if got != 3 {
		t.Errorf("expected snatcher_dispatch_total{status=ok}=3, got %v", got)
	}
}

// TestBanTotal_Increment verifies that the BanTotal counter increments correctly.
func TestBanTotal_Increment(t *testing.T) {
	reg := newTestRegistry(t)

	BanTotal.WithLabelValues("ip").Add(2)

	families, err := reg.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	family := findFamily(families, "snatcher_ban_total")
	if family == nil {
		t.Fatal("metric family snatcher_ban_total not found")
	}

	got := sumCounterValues(family, "type", "ip")
	if got != 2 {
		t.Errorf("expected snatcher_ban_total{type=ip}=2, got %v", got)
	}
}

// TestQueueDepth_SetAndRead verifies that the QueueDepth gauge can be set and
// retrieved for a specific queue label.
func TestQueueDepth_SetAndRead(t *testing.T) {
	reg := newTestRegistry(t)

	QueueDepth.WithLabelValues("classify").Set(42)

	families, err := reg.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	family := findFamily(families, "snatcher_queue_depth")
	if family == nil {
		t.Fatal("metric family snatcher_queue_depth not found")
	}

	got := sumGaugeValues(family, "queue", "classify")
	if got != 42 {
		t.Errorf("expected snatcher_queue_depth{queue=classify}=42, got %v", got)
	}
}

// TestLLMClassificationPendingReview_SetAndRead verifies that the
// LLMClassificationPendingReview gauge is registered and can be set for both
// classification_type label values ('brand' and 'category').
func TestLLMClassificationPendingReview_SetAndRead(t *testing.T) {
	reg := newTestRegistry(t)

	LLMClassificationPendingReview.WithLabelValues("brand").Set(10)
	LLMClassificationPendingReview.WithLabelValues("category").Set(5)

	families, err := reg.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	family := findFamily(families, "llm_classification_pending_review")
	if family == nil {
		t.Fatal("metric family llm_classification_pending_review not found")
	}

	if got := sumGaugeValues(family, "classification_type", "brand"); got != 10 {
		t.Errorf("expected llm_classification_pending_review{classification_type=brand}=10, got %v", got)
	}

	if got := sumGaugeValues(family, "classification_type", "category"); got != 5 {
		t.Errorf("expected llm_classification_pending_review{classification_type=category}=5, got %v", got)
	}
}

// findFamily returns the MetricFamily with the given name from the gathered slice.
func findFamily(families []*dto.MetricFamily, name string) *dto.MetricFamily {
	for _, f := range families {
		if f.GetName() == name {
			return f
		}
	}
	return nil
}

// sumCounterValues sums the value of all Counter metrics in the family where
// the label with labelName equals labelValue.
func sumCounterValues(family *dto.MetricFamily, labelName, labelValue string) float64 {
	var total float64
	for _, m := range family.GetMetric() {
		if labelMatches(m, labelName, labelValue) {
			total += m.GetCounter().GetValue()
		}
	}
	return total
}

// sumGaugeValues sums the value of all Gauge metrics in the family where the
// label with labelName equals labelValue.
func sumGaugeValues(family *dto.MetricFamily, labelName, labelValue string) float64 {
	var total float64
	for _, m := range family.GetMetric() {
		if labelMatches(m, labelName, labelValue) {
			total += m.GetGauge().GetValue()
		}
	}
	return total
}

// labelMatches reports whether any label pair in m has name==labelName and
// value==labelValue. The comparison is case-insensitive for robustness.
func labelMatches(m *dto.Metric, labelName, labelValue string) bool {
	for _, lp := range m.GetLabel() {
		if strings.EqualFold(lp.GetName(), labelName) &&
			strings.EqualFold(lp.GetValue(), labelValue) {
			return true
		}
	}
	return false
}
