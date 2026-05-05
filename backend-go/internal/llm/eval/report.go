package eval

import (
	"fmt"
	"html"
	"strings"
)

// HTMLReport gera um relatório HTML dos resultados.
func HTMLReport(results []Result, title string) string {
	var sb strings.Builder

	sb.WriteString(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>`)
	sb.WriteString(html.EscapeString(title))
	sb.WriteString(`</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; background: #f5f5f5; }
    .header { background: #2c3e50; color: white; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
    .header h1 { margin: 0; }
    .stats { display: flex; gap: 20px; margin: 15px 0; }
    .stat { background: white; padding: 15px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: bold; color: #2c3e50; }
    table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #34495e; color: white; padding: 12px; text-align: left; font-weight: 600; }
    td { padding: 12px; border-bottom: 1px solid #ecf0f1; }
    tr:hover { background: #f9f9f9; }
    .pass { color: #27ae60; font-weight: 600; }
    .fail { color: #e74c3c; font-weight: 600; }
    .score-bar { display: inline-block; height: 24px; background: linear-gradient(to right, #e74c3c, #f39c12, #27ae60); border-radius: 3px; overflow: hidden; }
    .score-text { color: white; padding: 0 6px; font-size: 12px; font-weight: 600; display: flex; align-items: center; height: 100%; }
    .error { color: #e74c3c; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>`)
	sb.WriteString(html.EscapeString(title))
	sb.WriteString(`</h1>
  </div>
`)

	// Estatísticas
	passed := 0
	avgScore := 0.0
	totalLatency := int64(0)

	for _, r := range results {
		if r.Passed {
			passed++
		}
		avgScore += r.Score
		totalLatency += r.LatencyMs
	}

	if len(results) > 0 {
		avgScore /= float64(len(results))
	}

	sb.WriteString(`  <div class="stats">
    <div class="stat">
      <div class="stat-label">Passed</div>
      <div class="stat-value">`)
	sb.WriteString(fmt.Sprintf("%d/%d", passed, len(results)))
	sb.WriteString(`</div>
    </div>
    <div class="stat">
      <div class="stat-label">Avg Score</div>
      <div class="stat-value">`)
	sb.WriteString(fmt.Sprintf("%.1f%%", avgScore*100))
	sb.WriteString(`</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Latency</div>
      <div class="stat-value">`)
	sb.WriteString(fmt.Sprintf("%dms", totalLatency))
	sb.WriteString(`</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Case Name</th>
        <th>Status</th>
        <th>Score</th>
        <th>Latency (ms)</th>
      </tr>
    </thead>
    <tbody>
`)

	for _, r := range results {
		statusClass := "pass"
		statusText := "PASS"
		if !r.Passed {
			statusClass = "fail"
			statusText = "FAIL"
		}

		sb.WriteString(`      <tr>
        <td>`)
		sb.WriteString(html.EscapeString(r.CaseName))
		sb.WriteString(`</td>
        <td><span class="`)
		sb.WriteString(statusClass)
		sb.WriteString(`">`)
		sb.WriteString(statusText)
		sb.WriteString(`</span></td>
        <td>
          <div class="score-bar" style="width: `)
		sb.WriteString(fmt.Sprintf("%.0f", r.Score*100))
		sb.WriteString(`px">
            <div class="score-text">`)
		sb.WriteString(fmt.Sprintf("%.0f%%", r.Score*100))
		sb.WriteString(`</div>
          </div>
        </td>
        <td>`)
		sb.WriteString(fmt.Sprintf("%d", r.LatencyMs))
		sb.WriteString(`</td>
      </tr>
`)

		if r.Error != "" {
			sb.WriteString(`      <tr>
        <td colspan="4"><div class="error">Error: `)
			sb.WriteString(html.EscapeString(r.Error))
			sb.WriteString(`</div></td>
      </tr>
`)
		}
	}

	sb.WriteString(`    </tbody>
  </table>
</body>
</html>`)

	return sb.String()
}

// TextReport gera um relatório em texto simples dos resultados (já existe em runner.go).
// Deixa aqui como referência consolidada.
func TextReport(results []Result) string {
	var sb strings.Builder
	passed, total := 0, len(results)

	for _, r := range results {
		status := "PASS"
		if !r.Passed {
			status = "FAIL"
		}
		if r.Passed {
			passed++
		}
		sb.WriteString(fmt.Sprintf("[%s] %s — score=%.2f latency=%dms\n", status, r.CaseName, r.Score, r.LatencyMs))
		if r.Error != "" {
			sb.WriteString(fmt.Sprintf("  ERROR: %s\n", r.Error))
		}
	}
	sb.WriteString(fmt.Sprintf("\n%d/%d passed\n", passed, total))
	return sb.String()
}

// SummaryStats retorna estatísticas agregadas dos resultados.
type SummaryStats struct {
	Total        int
	Passed       int
	Failed       int
	AvgScore     float64
	MinScore     float64
	MaxScore     float64
	P50Latency   float64
	P95Latency   float64
	TotalLatency int64
}

// ComputeStats calcula estatísticas a partir dos resultados.
func ComputeStats(results []Result) SummaryStats {
	if len(results) == 0 {
		return SummaryStats{}
	}

	stats := SummaryStats{
		Total:    len(results),
		MinScore: 1.0,
	}

	latencies := make([]int64, 0, len(results))

	for _, r := range results {
		if r.Passed {
			stats.Passed++
		} else {
			stats.Failed++
		}
		stats.AvgScore += r.Score
		if r.Score < stats.MinScore {
			stats.MinScore = r.Score
		}
		if r.Score > stats.MaxScore {
			stats.MaxScore = r.Score
		}
		latencies = append(latencies, r.LatencyMs)
		stats.TotalLatency += r.LatencyMs
	}

	stats.AvgScore /= float64(len(results))
	stats.P50Latency = LatencyPercentile(latencies, 50)
	stats.P95Latency = LatencyPercentile(latencies, 95)

	return stats
}
