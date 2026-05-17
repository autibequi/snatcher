package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/llm/eval"
	"snatcher/backendv2/internal/services/prompts"
)

func main() {
	operation := flag.String("op", "compose", "Operation: compose, parse_offer, cluster_label, etc.")
	version := flag.String("version", "v1", "Prompt version (v1, v2, etc.)")
	clientType := flag.String("client", "mock", "Client type: mock or real")
	outputFile := flag.String("output", "", "Output HTML file (optional, default: stdout)")
	textOutput := flag.Bool("text", false, "Output as text instead of HTML")
	casesDir := flag.String("cases-dir", "", "Diretório com arquivos *.yaml de casos de teste externos (opcional)")
	flag.Parse()

	// Carregar registry com prompts embutidos
	reg := prompts.NewRegistry()

	// Criar cliente conforme solicitado
	var client llm.Client
	if *clientType == "real" {
		// Criar client real (OpenRouter)
		apiKey := os.Getenv("OPENROUTER_API_KEY")
		if apiKey == "" {
			fmt.Fprintf(os.Stderr, "error: OPENROUTER_API_KEY not set\n")
			os.Exit(1)
		}
		client = llm.NewOpenRouter(apiKey)
	} else {
		// Usar mock client
		client = &eval.MockClient{}
	}

	// Criar runner
	runner := eval.NewRunner(reg, client)

	// Carregar casos: externos do diretório (se passado) + padrão como fallback
	cases := eval.DefaultCases()
	if *casesDir != "" {
		external, loadErr := eval.LoadCasesDir(*casesDir)
		if loadErr != nil {
			fmt.Fprintf(os.Stderr, "error: falha ao carregar casos de %s: %v\n", *casesDir, loadErr)
			os.Exit(1)
		}
		if len(external) > 0 {
			// Casos externos substituem os padrão quando diretório é passado explicitamente
			cases = external
		}
	}

	// Executar
	ctx := context.Background()
	results := runner.Run(ctx, cases)

	// Gerar relatório
	var report string
	if *textOutput {
		report = eval.TextReport(results)
	} else {
		report = eval.HTMLReport(results, fmt.Sprintf("LLM Eval — %s (%s)", *operation, *version))
	}

	// Salvar ou imprimir
	if *outputFile != "" {
		err := os.WriteFile(*outputFile, []byte(report), 0644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: failed to write %s: %v\n", *outputFile, err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stdout, "wrote report to %s\n", *outputFile)
	} else {
		fmt.Println(report)
	}

	// Verificar se passou threshold
	stats := eval.ComputeStats(results)
	if stats.AvgScore < 0.7 {
		fmt.Fprintf(os.Stderr, "error: avg score %.2f < 0.7 threshold\n", stats.AvgScore)
		os.Exit(1)
	}
}
