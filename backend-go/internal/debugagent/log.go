// Package debugagent envia NDJSON para análise local de sessão (Cursor debug).
// Falha silenciosa se o path não existir (ex.: deploy Coolify sem esse volume).
package debugagent

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

const LogPath = "/workspace/target/.cursor/debug-a8c6c8.log"
const SessionID = "a8c6c8"

var mu sync.Mutex

// Write acrescenta uma linha NDJSON; sem PII/secrets em data.
func Write(hypothesisID, location, message string, data map[string]any, runID string) {
	mu.Lock()
	defer mu.Unlock()
	if data == nil {
		data = map[string]any{}
	}
	payload := map[string]any{
		"sessionId":    SessionID,
		"hypothesisId": hypothesisID,
		"location":     location,
		"message":      message,
		"data":         data,
		"timestamp":    time.Now().UnixMilli(),
	}
	if runID != "" {
		payload["runId"] = runID
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	f, err := os.OpenFile(LogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	_, _ = f.Write(append(b, '\n'))
	_ = f.Close()
}
