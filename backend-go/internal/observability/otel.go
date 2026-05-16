package observability

import (
	"context"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/stdout/stdoutmetric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

// InitOTel initialises the OpenTelemetry SDK with an OTLP gRPC exporter when
// OTEL_EXPORTER_OTLP_ENDPOINT is set, or a stdout exporter otherwise (dev/test).
//
// Returns a shutdown function that must be deferred by the caller to flush and
// close the exporter cleanly on process exit.
//
// Usage:
//
//	shutdown, err := observability.InitOTel(ctx)
//	if err != nil { ... }
//	defer shutdown(ctx)
func InitOTel(ctx context.Context) (shutdown func(context.Context) error, err error) {
	exporter, err := buildExporter(ctx)
	if err != nil {
		return nil, err
	}

	provider := buildProvider(exporter)

	// Set the global MeterProvider so otel.Meter() works anywhere in the process.
	otel.SetMeterProvider(provider)

	// Return a shutdown function that flushes pending telemetry and closes the exporter.
	shutdownFn := func(shutCtx context.Context) error {
		return provider.Shutdown(shutCtx)
	}

	return shutdownFn, nil
}

// buildExporter decides which exporter to use based on environment.
// When OTEL_EXPORTER_OTLP_ENDPOINT is empty, a stdout exporter is used so
// local development produces human-readable metric output without a collector.
func buildExporter(ctx context.Context) (sdkmetric.Exporter, error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		return buildStdoutExporter()
	}

	return buildGRPCExporter(ctx)
}

// buildStdoutExporter creates a stdout exporter suitable for dev/test environments.
func buildStdoutExporter() (sdkmetric.Exporter, error) {
	return stdoutmetric.New(stdoutmetric.WithPrettyPrint())
}

// buildGRPCExporter creates an OTLP gRPC exporter targeting the endpoint in
// OTEL_EXPORTER_OTLP_ENDPOINT. The SDK will also honour the standard OTEL_*
// env vars (headers, TLS, compression) automatically.
func buildGRPCExporter(ctx context.Context) (sdkmetric.Exporter, error) {
	return otlpmetricgrpc.New(ctx)
}

// buildProvider wires the exporter into a periodic-reader MeterProvider.
// The reader flushes metrics every 30 seconds, which balances granularity
// against collector ingress volume in production.
func buildProvider(exporter sdkmetric.Exporter) *sdkmetric.MeterProvider {
	reader := sdkmetric.NewPeriodicReader(
		exporter,
		sdkmetric.WithInterval(30*time.Second),
	)

	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(reader),
	)

	return provider
}
