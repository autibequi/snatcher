package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/spy"
)

// spyStore é a interface mínima que SpyPollingJob precisa do repositório.
// Definida aqui para evitar import cycle entre jobs ↔ repositories.
type spyStore interface {
	// ListGroupSpies retorna todos os group spies, opcionalmente filtrados.
	ListGroupSpies(platform string, activeOnly bool) ([]models.GroupSpy, error)
	// CreateSpyMessage persiste uma mensagem coletada de um grupo espionado.
	CreateSpyMessage(m models.SpyMessage) error
}

// SpyPollingJob coleta mensagens de grupos espionados e persiste em spy_messages.
// Em produção, o gateway real (Baileys/gramjs sidecar) fornece as mensagens.
// Quando MESSAGING_MOCK=true, usa mensagens sintéticas para fechar o pipeline end-to-end.
type SpyPollingJob struct {
	store   spyStore
	parser  *spy.Parser
	gateway spyMessageGateway
}

// spyMessageGateway é a interface mínima que o job precisa para buscar mensagens.
// Desacoplada da messaging.Gateway completa pois o Gateway atual não suporta leitura.
type spyMessageGateway interface {
	// FetchMessages retorna mensagens brutas do grupo desde `since`.
	// Retorna ErrNotSupported se o gateway não suporta leitura.
	FetchMessages(ctx context.Context, groupRemoteID string, since time.Time) ([]rawSpyMessage, error)
}

// rawSpyMessage é uma mensagem bruta recebida do gateway.
type rawSpyMessage struct {
	Sender      string
	Text        string
	MediaURL    string
	ReceivedAt  time.Time
}

// ErrGatewayNotSupported indica que o gateway não suporta leitura de mensagens.
var ErrGatewayNotSupported = fmt.Errorf("spy gateway: leitura de mensagens não suportada")

// --- Mock gateway ---

// MockSpyGateway simula mensagens para fechar o pipeline end-to-end sem infra real.
// Ativado quando MESSAGING_MOCK=true.
type MockSpyGateway struct{}

// FetchMessages retorna mensagens sintéticas representando uma rodada de coleta.
func (m *MockSpyGateway) FetchMessages(_ context.Context, groupRemoteID string, since time.Time) ([]rawSpyMessage, error) {
	now := time.Now()
	return []rawSpyMessage{
		{
			Sender:     "5511999990001@s.whatsapp.net",
			Text:       fmt.Sprintf("iPhone 15 Pro por R$ 5.499 na Amazon! https://amzn.to/mock-%s", groupRemoteID),
			ReceivedAt: now,
		},
		{
			Sender:     "5511999990002@s.whatsapp.net",
			Text:       "Samsung Galaxy A15 128GB - R$ 899 com 15%% off no Americanas",
			ReceivedAt: now.Add(-30 * time.Second),
		},
	}, nil
}

// --- Stub gateway para produção (gateway real não implementado) ---

// StubSpyGateway retorna ErrGatewayNotSupported.
// Usado em produção enquanto o sidecar Baileys/gramjs não está disponível (ADR-009 pendente).
type StubSpyGateway struct{}

// FetchMessages sempre retorna ErrGatewayNotSupported.
func (s *StubSpyGateway) FetchMessages(_ context.Context, _ string, _ time.Time) ([]rawSpyMessage, error) {
	return nil, ErrGatewayNotSupported
}

// newSpyMessageGateway retorna o gateway correto conforme ambiente.
// Quando MESSAGING_MOCK=true usa mock; caso contrário retorna o stub (production-safe).
func newSpyMessageGateway() spyMessageGateway {
	if os.Getenv("MESSAGING_MOCK") == "true" {
		return &MockSpyGateway{}
	}
	return &StubSpyGateway{}
}

// NewSpyPollingJob cria um SpyPollingJob com as dependências injetadas.
// st deve implementar spyStore (ListGroupSpies + CreateSpyMessage).
// A interface store.Store do repositório satisfaz spyStore automaticamente.
func NewSpyPollingJob(st spyStore, p *spy.Parser) *SpyPollingJob {
	return &SpyPollingJob{
		store:   st,
		parser:  p,
		gateway: newSpyMessageGateway(),
	}
}

// Run executa uma rodada de polling para todos os GroupSpies ativos.
// Deve ser chamado pelo scheduler a cada N minutos.
func (j *SpyPollingJob) Run(ctx context.Context) error {
	// Busca todos os GroupSpies ativos (todas as plataformas).
	spies, err := j.store.ListGroupSpies("", true)
	if err != nil {
		return fmt.Errorf("spy_polling: listar group spies: %w", err)
	}

	if len(spies) == 0 {
		slog.DebugContext(ctx, "spy_polling: nenhum group spy ativo, pulando rodada")
		return nil
	}

	// Busca mensagens desde 10 minutos atrás (alinha com tick do scheduler).
	since := time.Now().Add(-10 * time.Minute)
	totalPersisted := 0

	for _, groupSpy := range spies {
		persisted, pollErr := j.pollOneSpy(ctx, groupSpy, since)
		if pollErr != nil {
			// Log e continua para o próximo spy — falha isolada não para o job.
			slog.WarnContext(ctx, "spy_polling: erro ao coletar mensagens",
				"spy_id", groupSpy.ID,
				"group_name", groupSpy.GroupName,
				"err", pollErr,
			)
			continue
		}
		totalPersisted += persisted
	}

	slog.InfoContext(ctx, "spy_polling: rodada concluída",
		"spies_ativos", len(spies),
		"mensagens_persistidas", totalPersisted,
	)
	return nil
}

// pollOneSpy coleta e persiste mensagens de um único GroupSpy.
// Retorna o número de mensagens persistidas.
func (j *SpyPollingJob) pollOneSpy(ctx context.Context, groupSpy models.GroupSpy, since time.Time) (int, error) {
	remoteID := groupSpy.RemoteGroupID.String
	if remoteID == "" {
		// Spy sem remote_group_id configurado — ainda não ingressou no grupo real.
		slog.DebugContext(ctx, "spy_polling: remote_group_id ausente, pulando",
			"spy_id", groupSpy.ID)
		return 0, nil
	}

	// Busca mensagens via gateway (mock ou stub).
	rawMessages, err := j.gateway.FetchMessages(ctx, remoteID, since)
	if err == ErrGatewayNotSupported {
		// Gateway real não disponível — comportamento esperado em produção sem sidecar.
		slog.DebugContext(ctx, "spy_polling: gateway não suporta leitura (ADR-009 pendente)",
			"spy_id", groupSpy.ID)
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("fetch messages spy_id=%d: %w", groupSpy.ID, err)
	}

	// Filtra e persiste mensagens que o parser identifica como candidatos válidos.
	persisted := 0
	for _, raw := range rawMessages {
		_, isOffer := j.parser.ToCandidate(ctx, raw.Text)
		if !isOffer {
			// Mensagem não é uma oferta — persiste assim mesmo para análise futura.
			// A decisão de filtrar apenas ofertas pode ser revisada em ADR futuro.
		}

		msg := models.SpyMessage{
			SpyID:       groupSpy.ID,
			Sender:      raw.Sender,
			Text:        raw.Text,
			CollectedAt: raw.ReceivedAt,
		}
		if raw.MediaURL != "" {
			msg.MediaURL = models.NewNullString(raw.MediaURL)
		}

		if persistErr := j.store.CreateSpyMessage(msg); persistErr != nil {
			slog.WarnContext(ctx, "spy_polling: falha ao persistir mensagem",
				"spy_id", groupSpy.ID,
				"sender", raw.Sender,
				"err", persistErr,
			)
			continue
		}
		persisted++
	}

	if persisted > 0 {
		slog.InfoContext(ctx, "spy_polling: mensagens coletadas",
			"spy_id", groupSpy.ID,
			"group_name", groupSpy.GroupName,
			"count", persisted,
		)
	}
	return persisted, nil
}
