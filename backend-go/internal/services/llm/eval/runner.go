package eval

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/prompts"
)

// Case representa um caso de teste para um prompt.
type Case struct {
	Name     string         `json:"name"`
	Operation string        `json:"operation"`
	Input    map[string]any `json:"input"`
	Expected Expected       `json:"expected"`
}

// Expected define critérios de validação.
type Expected struct {
	ContainsKeywords []string `json:"contains_keywords"`
	MatchesSchema    bool     `json:"matches_schema"`
	NotEmpty         bool     `json:"not_empty"`
}

// Result é o resultado de um caso de teste.
type Result struct {
	CaseName  string
	Passed    bool
	Score     float64 // 0..1
	Output    string
	Error     string
	LatencyMs int64
}

// Runner executa casos de teste contra um prompt registry e client LLM.
type Runner struct {
	registry *prompts.Registry
	client   llm.Client
}

func NewRunner(reg *prompts.Registry, cli llm.Client) *Runner {
	return &Runner{registry: reg, client: cli}
}

// NewMockRunner retorna um runner que usa mock client (sem LLM real).
func NewMockRunner(reg *prompts.Registry) *Runner {
	return &Runner{registry: reg, client: &MockClient{}}
}

type MockClient struct{}

func (m *MockClient) Complete(_ context.Context, prompt string, opts llm.Options) (string, error) {
	// Retorna JSON mínimo válido baseado na operação
	switch opts.Operation {
	case "compose":
		return `{"text":"Produto incrível! R$ 99,99 -15%","hashtags":["promo","desconto"],"emoji_set":["🔥"],"media_suggestion":"foto do produto"}`, nil
	case "parse_offer":
		return `{"is_offer":true,"title":"Notebook Dell","marketplace":"amazon","price_current":2999.0,"price_original":3500.0,"drop_pct":14.3,"url":"https://amzn.to/xyz"}`, nil
	case "cluster_label":
		return `{"label":"Caçadores de eletrônicos","description":"Audiência focada em eletronicos com bom custo-benefício"}`, nil
	default:
		return fmt.Sprintf(`{"result":"mock response for %s"}`, opts.Operation), nil
	}
}

// Run executa uma lista de casos e retorna resultados.
func (r *Runner) Run(ctx context.Context, cases []Case) []Result {
	results := make([]Result, 0, len(cases))
	for _, c := range cases {
		res := r.runCase(ctx, c)
		results = append(results, res)
	}
	return results
}

func (r *Runner) runCase(ctx context.Context, c Case) Result {
	res := Result{CaseName: c.Name}

	p, err := r.registry.Active(c.Operation)
	if err != nil {
		res.Error = fmt.Sprintf("registry: %v", err)
		return res
	}

	start := time.Now()
	output, err := r.client.Complete(ctx, "eval-case:"+c.Name, llm.Options{
		Operation:   c.Operation,
		MaxTokens:   p.MaxTokens,
		Temperature: p.Temperature,
	})
	res.LatencyMs = time.Since(start).Milliseconds()

	if err != nil {
		res.Error = err.Error()
		return res
	}
	res.Output = output

	// Avaliar critérios
	score := 0.0
	checks := 0

	if c.Expected.NotEmpty && output != "" {
		score++
	}
	if c.Expected.NotEmpty {
		checks++
	}

	for _, kw := range c.Expected.ContainsKeywords {
		checks++
		if strings.Contains(strings.ToLower(output), strings.ToLower(kw)) {
			score++
		}
	}

	if c.Expected.MatchesSchema {
		checks++
		var obj map[string]any
		if json.Unmarshal([]byte(output), &obj) == nil {
			score++
		}
	}

	if checks > 0 {
		res.Score = score / float64(checks)
	} else {
		res.Score = 1.0
	}
	res.Passed = res.Score >= 0.7
	return res
}

// Report gera um relatório texto dos resultados.
func Report(results []Result) string {
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

// DefaultCases retorna casos de teste padrão para todos os prompts.
func DefaultCases() []Case {
	return []Case{
		{
			Name:      "compose_basic",
			Operation: "compose",
			Input:     map[string]any{"product": "Notebook", "price": 2999.0},
			Expected:  Expected{NotEmpty: true, MatchesSchema: true},
		},
		{
			Name:      "parse_offer_basic",
			Operation: "parse_offer",
			Input:     map[string]any{"message": "Notebook por R$ 2999!"},
			Expected:  Expected{NotEmpty: true, MatchesSchema: true},
		},
		{
			Name:      "cluster_label_basic",
			Operation: "cluster_label",
			Input:     map[string]any{"categories": []string{"eletronicos"}},
			Expected:  Expected{NotEmpty: true, MatchesSchema: true},
		},
	}
}

// WriteReport salva o relatório em um arquivo.
func WriteReport(path string, results []Result) error {
	return os.WriteFile(path, []byte(Report(results)), 0644)
}
