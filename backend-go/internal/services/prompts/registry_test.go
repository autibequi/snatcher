package prompts

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRegistry_Active(t *testing.T) {
	r := NewRegistry()

	// compose v1 deve estar disponível
	p, err := r.Active("compose")
	if err != nil {
		t.Fatalf("Active(compose): %v", err)
	}
	if p.Operation != "compose" || p.Version != "v1" {
		t.Errorf("expected compose/v1, got %s/%s", p.Operation, p.Version)
	}
}

func TestPrompt_Render(t *testing.T) {
	r := NewRegistry()
	p, _ := r.Active("compose")

	type ProductData struct {
		Title       string
		Marketplace string
		Price       float64
		Drop        float64
	}
	type RenderData struct {
		Product ProductData
		Channel any
	}
	result, err := p.Render(RenderData{
		Product: ProductData{Title: "Notebook Lenovo", Marketplace: "Amazon", Price: 2999.99, Drop: 15},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !strings.Contains(result, "Notebook Lenovo") {
		t.Errorf("rendered output missing product title")
	}
}

func TestRegistry_ParseOffer(t *testing.T) {
	r := NewRegistry()
	p, err := r.Active("parse_offer")
	if err != nil {
		t.Fatal(err)
	}

	type Data struct {
		RawMessage string
		Links      []string
	}
	out, err := p.Render(Data{RawMessage: "Notebook por R$ 2999!", Links: []string{"https://amazon.com.br/xyz"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "R$ 2999") {
		t.Error("expected message in rendered output")
	}
}

// TestRegistry_RephraseReasons verifica que rephrase_reasons/v1 está no registry
// e renderiza corretamente o template com input válido.
func TestRegistry_RephraseReasons(t *testing.T) {
	r := NewRegistry()
	p, err := r.Active("rephrase_reasons")
	if err != nil {
		t.Fatalf("Active(rephrase_reasons): %v — prompt deve estar em embedded.go", err)
	}
	if p.Operation != "rephrase_reasons" || p.Version != "v1" {
		t.Errorf("expected rephrase_reasons/v1, got %s/%s", p.Operation, p.Version)
	}

	type Input struct {
		Reasons  []string
		Language string
	}
	rendered, err := p.Render(Input{
		Reasons:  []string{"Desconto 30%", "Frete grátis"},
		Language: "pt-BR",
	})
	if err != nil {
		t.Fatalf("Render rephrase_reasons: %v", err)
	}
	if !strings.Contains(rendered, "pt-BR") {
		t.Error("rendered output deve conter o idioma 'pt-BR'")
	}
	if !strings.Contains(rendered, "Desconto 30%") {
		t.Error("rendered output deve conter as razões de entrada")
	}
}

// goldenSnap representa a estrutura de um arquivo .snap.json.
// Cada snap define a operação, versão, input (como JSON genérico) e strings esperadas no output.
type goldenSnap struct {
	Operation              string         `json:"operation"`
	Version                string         `json:"version"`
	Input                  map[string]any `json:"input"`
	ExpectedOutputContains []string       `json:"expected_output_contains"`
}

// TestRegistry_GoldenFiles carrega todos os arquivos .snap.json de testdata/,
// renderiza o prompt correspondente com o input do snap e valida que o output
// contém as strings esperadas. Não chama LLM — apenas renderiza o template Go.
func TestRegistry_GoldenFiles(t *testing.T) {
	snapDir := "testdata"

	// Descobre todos os arquivos .snap.json no diretório testdata/
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		t.Fatalf("não foi possível ler testdata/: %v", err)
	}

	r := NewRegistry()

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".snap.json") {
			continue
		}

		snapPath := filepath.Join(snapDir, entry.Name())

		t.Run(entry.Name(), func(t *testing.T) {
			// Lê e parseia o arquivo snap
			raw, readErr := os.ReadFile(snapPath)
			if readErr != nil {
				t.Fatalf("leitura do snap falhou: %v", readErr)
			}

			var snap goldenSnap
			if jsonErr := json.Unmarshal(raw, &snap); jsonErr != nil {
				t.Fatalf("parse do snap falhou: %v", jsonErr)
			}

			// Busca o prompt no registry
			prompt, activeErr := r.Get(snap.Operation, snap.Version)
			if activeErr != nil {
				t.Fatalf("prompt %s/%s não encontrado no registry: %v", snap.Operation, snap.Version, activeErr)
			}

			// Renderiza o template com o input genérico (map[string]any)
			rendered, renderErr := prompt.Render(snap.Input)
			if renderErr != nil {
				t.Fatalf("render falhou para %s/%s: %v", snap.Operation, snap.Version, renderErr)
			}

			// Valida que o output contém todas as strings esperadas
			for _, expected := range snap.ExpectedOutputContains {
				if !strings.Contains(rendered, expected) {
					t.Errorf("output de %s/%s não contém %q\noutput completo:\n%s",
						snap.Operation, snap.Version, expected, rendered)
				}
			}
		})
	}
}
