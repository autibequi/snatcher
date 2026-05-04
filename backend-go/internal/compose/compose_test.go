package compose_test

import (
	"context"
	"testing"

	"snatcher/backendv2/internal/compose"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
)

// mockLLM implementa llm.Client para testes.
type mockLLM struct {
	response string
	err      error
	called   int
}

func (m *mockLLM) Complete(_ context.Context, _ string, _ llm.Options) (string, error) {
	m.called++
	return m.response, m.err
}

func TestPreview_JSONResponse(t *testing.T) {
	mock := &mockLLM{
		response: `{"text":"🔥 Tênis Nike apenas R$ 199!","hashtags":["#oferta","#nike","#tenis"],"emoji_set":["🔥","👟"],"media_suggestion":"foto do produto em uso"}`,
	}
	svc := compose.NewService(mock)

	prod := compose.ProductInput{
		Title:       "Tênis Nike Air",
		Marketplace: "Shopee",
		Price:       199.90,
		PriceOrig:   399.90,
		Drop:        50,
		Category:    "calçados",
		Brand:       "Nike",
	}

	got, err := svc.Preview(context.Background(), prod, nil)
	if err != nil {
		t.Fatalf("Preview retornou erro inesperado: %v", err)
	}
	if got.Text == "" {
		t.Error("Text não deve ser vazio")
	}
	if len(got.Hashtags) == 0 {
		t.Error("Hashtags não devem ser vazias")
	}
	if mock.called != 1 {
		t.Errorf("LLM deve ser chamado 1 vez, got %d", mock.called)
	}
}

func TestPreview_FallbackOnLLMError(t *testing.T) {
	mock := &mockLLM{err: context.DeadlineExceeded}
	svc := compose.NewService(mock)

	prod := compose.ProductInput{
		Title:     "Produto Teste",
		Price:     50.0,
		PriceOrig: 100.0,
		Drop:      50,
	}

	got, err := svc.Preview(context.Background(), prod, nil)
	if err != nil {
		t.Fatalf("Preview não deve propagar erro do LLM: %v", err)
	}
	if got.Text == "" {
		t.Error("fallback deve produzir texto não-vazio")
	}
}

func TestPreview_WithChannel(t *testing.T) {
	mock := &mockLLM{
		response: `{"text":"Oferta especial!","hashtags":["#oferta"],"emoji_set":["🔥"],"media_suggestion":"banner"}`,
	}
	svc := compose.NewService(mock)

	prod := compose.ProductInput{
		Title:    "Fone Bluetooth",
		Price:    89.90,
		Category: "eletronicos",
	}
	ch := &models.Channel{
		Name: "Tech Deals",
		Audience: models.Audience{
			Categories: []string{"eletronicos"},
			Gender:     "mix",
		},
	}

	got, err := svc.Preview(context.Background(), prod, ch)
	if err != nil {
		t.Fatalf("Preview retornou erro: %v", err)
	}
	if got.Text == "" {
		t.Error("Text não deve ser vazio com canal fornecido")
	}
}

func TestPreview_RawTextFallback(t *testing.T) {
	// LLM retorna texto puro em vez de JSON
	mock := &mockLLM{response: "Oferta incrível! Não perca."}
	svc := compose.NewService(mock)

	prod := compose.ProductInput{Title: "Produto X", Price: 20.0}
	got, err := svc.Preview(context.Background(), prod, nil)
	if err != nil {
		t.Fatalf("Preview retornou erro: %v", err)
	}
	if got.Text != "Oferta incrível! Não perca." {
		t.Errorf("Text inesperado: %q", got.Text)
	}
}
