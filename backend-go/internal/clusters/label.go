package clusters

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/prompts"
)

// ClusterLabel é o resultado do labeling de um cluster.
type ClusterLabel struct {
	Label       string `json:"label"`
	Description string `json:"description"`
}

// RenderInput representa os dados do cluster para o template.
type RenderInput struct {
	TopCategories []string
	TopBrands     []string
	CTR           float64
	CVR           float64
	AvgTicket     float64
	MemberCount   int
}

// Labeler gera labels LLM para clusters.
type Labeler struct {
	llmCli   llm.Client
	registry *prompts.Registry
}

// NewLabeler cria um Labeler com o cliente LLM fornecido.
func NewLabeler(llmCli llm.Client) *Labeler {
	return &Labeler{
		llmCli:   llmCli,
		registry: prompts.NewRegistry(),
	}
}

// Label gera um label para um cluster. Retorna fallback nominal se LLM falhar ou não estiver configurado.
func (l *Labeler) Label(ctx context.Context, input RenderInput) ClusterLabel {
	fallback := ClusterLabel{
		Label:       fmt.Sprintf("Cluster %d canais", input.MemberCount),
		Description: fmt.Sprintf("Top: %s", strings.Join(input.TopCategories, ", ")),
	}

	if l.llmCli == nil {
		return fallback
	}

	p, err := l.registry.Active("cluster_label")
	if err != nil {
		return fallback
	}

	rendered, err := p.Render(input)
	if err != nil {
		return fallback
	}

	resp, err := l.llmCli.Complete(ctx, rendered, llm.Options{
		Operation:   "cluster_label",
		MaxTokens:   p.MaxTokens,
		Temperature: p.Temperature,
	})
	if err != nil {
		return fallback
	}

	resp = strings.TrimSpace(resp)
	resp = strings.TrimPrefix(resp, "```json")
	resp = strings.TrimPrefix(resp, "```")
	resp = strings.TrimSuffix(resp, "```")
	resp = strings.TrimSpace(resp)

	var label ClusterLabel
	if err := json.Unmarshal([]byte(resp), &label); err != nil {
		return fallback
	}
	if label.Label == "" {
		return fallback
	}
	return label
}

// ExtractTopFromChannels retorna top categorias e marcas de uma lista de canais (até 5 de cada).
func ExtractTopFromChannels(channels []models.Channel) (categories, brands []string) {
	catCount := map[string]int{}
	brandCount := map[string]int{}
	for _, ch := range channels {
		for _, c := range ch.Audience.Categories {
			catCount[c]++
		}
		for _, b := range ch.Audience.Brands {
			brandCount[b]++
		}
	}
	for k := range catCount {
		categories = append(categories, k)
		if len(categories) >= 5 {
			break
		}
	}
	for k := range brandCount {
		brands = append(brands, k)
		if len(brands) >= 5 {
			break
		}
	}
	return
}
