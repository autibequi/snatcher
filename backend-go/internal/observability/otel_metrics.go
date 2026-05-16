package observability

import (
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

// otelMeterName is the instrumentation scope name used for all snatcher OTel
// instruments. Appears in telemetry metadata sent to the collector.
const otelMeterName = "snatcher"

// OTel high-cardinality metrics.
//
// These are intentionally separate from the Prometheus vars in metrics.go.
// High-cardinality labels (channel_id, modem_id, arm_id) would explode
// Prometheus TSDB series count; they go to OTel → ClickHouse instead (I11).
//
// All vars are populated by InitOTelMetrics, which must be called after
// InitOTel so the global MeterProvider is already set.
var (
	// DispatchSendPerChannel counts dispatch send attempts per channel.
	// Label: channel_id (high-cardinality — may be thousands of distinct values).
	DispatchSendPerChannel metric.Int64Counter

	// LLMOpPerChannel counts LLM operations per channel and operation type.
	// Labels: channel_id, op (e.g. "score", "compose", "classify").
	LLMOpPerChannel metric.Int64Counter
)

// InitOTelMetrics registers the global OTel instruments using the global
// MeterProvider. Must be called after InitOTel.
//
// Errors from instrument creation are returned so the caller can decide
// whether to treat them as fatal.
func InitOTelMetrics() error {
	meter := otel.Meter(otelMeterName)

	if err := registerDispatchSendPerChannel(meter); err != nil {
		return err
	}

	if err := registerLLMOpPerChannel(meter); err != nil {
		return err
	}

	return nil
}

// registerDispatchSendPerChannel creates the DispatchSendPerChannel counter.
func registerDispatchSendPerChannel(meter metric.Meter) error {
	counter, err := meter.Int64Counter(
		"snatcher.dispatch.send_per_channel",
		metric.WithDescription("Total dispatch send attempts by channel (high-cardinality: channel_id)."),
		metric.WithUnit("{send}"),
	)
	if err != nil {
		return err
	}

	DispatchSendPerChannel = counter
	return nil
}

// registerLLMOpPerChannel creates the LLMOpPerChannel counter.
func registerLLMOpPerChannel(meter metric.Meter) error {
	counter, err := meter.Int64Counter(
		"snatcher.llm.op_per_channel",
		metric.WithDescription("Total LLM operations by channel and operation type (high-cardinality: channel_id, op)."),
		metric.WithUnit("{op}"),
	)
	if err != nil {
		return err
	}

	LLMOpPerChannel = counter
	return nil
}
