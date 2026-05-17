package eval

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"snatcher/backendv2/internal/services/prompts"
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

func TestLoadCasesDir_ReturnsNilForMissingDir(t *testing.T) {
	// Diretório inexistente deve retornar nil sem erro.
	cases, err := LoadCasesDir("/tmp/eval-cases-nao-existe-xyz")
	if err != nil {
		t.Fatalf("esperava nil error, got: %v", err)
	}
	if cases != nil {
		t.Errorf("esperava nil cases, got: %v", cases)
	}
}

func TestLoadCasesDir_LoadsYAMLCases(t *testing.T) {
	// Cria diretório temporário com um arquivo YAML de casos.
	dir := t.TempDir()
	yamlContent := `
- name: test_case_1
  operation: compose
  input:
    product: "Produto Teste"
    price: 100
  expected:
    contains_keywords:
      - produto
    matches_schema: true
    not_empty: true
- name: test_case_2
  operation: parse_offer
  input:
    text: "Oferta imperdivel!"
  expected:
    not_empty: true
`
	path := filepath.Join(dir, "test_cases.yaml")
	if err := os.WriteFile(path, []byte(yamlContent), 0644); err != nil {
		t.Fatal(err)
	}

	cases, err := LoadCasesDir(dir)
	if err != nil {
		t.Fatalf("LoadCasesDir erro inesperado: %v", err)
	}
	if len(cases) != 2 {
		t.Fatalf("esperava 2 casos, got %d", len(cases))
	}

	// Verifica primeiro caso
	first := cases[0]
	if first.Name != "test_case_1" {
		t.Errorf("nome incorreto: %q", first.Name)
	}
	if first.Operation != "compose" {
		t.Errorf("operation incorreta: %q", first.Operation)
	}
	if len(first.Expected.ContainsKeywords) != 1 || first.Expected.ContainsKeywords[0] != "produto" {
		t.Errorf("contains_keywords incorreto: %v", first.Expected.ContainsKeywords)
	}
	if !first.Expected.MatchesSchema {
		t.Error("matches_schema deveria ser true")
	}
	if !first.Expected.NotEmpty {
		t.Error("not_empty deveria ser true")
	}
}

func TestLoadCasesDir_WithRealCases(t *testing.T) {
	// Verifica que o diretório de casos reais do projeto pode ser carregado.
	// Este teste passa mesmo que o diretório não exista (CI sem casos criados ainda).
	cases, err := LoadCasesDir("cases")
	if err != nil {
		t.Fatalf("LoadCasesDir(cases) erro: %v", err)
	}
	// Apenas verifica que o loader não panics e retorna estrutura válida.
	for _, c := range cases {
		if c.Name == "" {
			t.Errorf("caso sem nome: %+v", c)
		}
		if c.Operation == "" {
			t.Errorf("caso sem operation: %+v", c)
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
