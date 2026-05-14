package compose

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"snatcher/backendv2/internal/services/llm"
)

// PersonalizeMessage reescreve o texto de disparo via LLM para soar mais natural,
// mantendo todos os dados (título, preço, link). Só chamado quando
// appconfig.use_llm_personalization = true.
//
// Falha graciosamente: se LLM não responder em 12s, retorna o texto original.
func PersonalizeMessage(ctx context.Context, cli llm.Client, originalText string) string {
	if strings.TrimSpace(originalText) == "" {
		return originalText
	}

	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`Você é um especialista em marketing para grupos de WhatsApp no Brasil.

Reescreva a mensagem de oferta abaixo para soar mais natural, como se fosse enviada por uma pessoa real — não por um bot automático.

Regras obrigatórias:
- Mantenha EXATAMENTE os mesmos dados: produto, preço, desconto e link
- Não invente informações
- Máximo 3 emojis diferentes
- Tom descontraído, brasileiro, sem excesso de exclamações
- Não remova o link
- Responda APENAS com o texto final, sem explicações

Mensagem original:
%s`, originalText)

	result, err := cli.Complete(ctx, prompt, llm.Options{
		Operation:   "personalize",
		MaxTokens:   512,
		Temperature: 0.7,
	})
	if err != nil {
		slog.Warn("personalizer: LLM falhou, usando texto original", "err", err)
		return originalText
	}

	personalized := strings.TrimSpace(result)
	if personalized == "" {
		return originalText
	}

	slog.Debug("personalizer: texto personalizado", "original_len", len(originalText), "personalized_len", len(personalized))
	return personalized
}
