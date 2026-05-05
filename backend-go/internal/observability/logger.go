package observability

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger creates a JSON structured logger with configurable level.
//
// Parameters:
//   - level: log level string (debug|info|warn|error). Defaults to "info" if
//     empty or unrecognised.
//   - env: runtime environment string. When "dev", source location is added to
//     every log record to aid debugging.
func NewLogger(level, env string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level:     lvl,
		AddSource: strings.EqualFold(env, "dev"),
	}

	handler := slog.NewJSONHandler(os.Stdout, opts)
	return slog.New(handler)
}
