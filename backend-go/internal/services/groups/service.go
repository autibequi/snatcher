// Package groups implementa a lógica de negócio de grupos (RedesignGroup).
// Extrai business logic do handler groups.go para facilitar teste e reuso.
package groups

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/invitelinks"
	store "snatcher/backendv2/internal/repositories"
)

// GroupEnriched estende RedesignGroup com campos calculados para o redesign.
// Espelha groupEnriched do handler para que o service possa ser reutilizado
// sem duplicação de lógica.
type GroupEnriched struct {
	models.RedesignGroup
	ChannelName        string `json:"channel_name"`
	AccountLabel       string `json:"account_label"`
	AdminCount         int    `json:"admin_count"`
	VerifiedAdminCount int    `json:"verified_admin_count"`
	AudienceStatus     string `json:"audience_status"`
	ChannelsCount      int    `json:"channels_count"`
}

// EvolutionVerifier verifica admins reais de um grupo via Evolution API.
// Interface permite mock em testes.
type EvolutionVerifier interface {
	// CountVerifiedAdmins retorna o número de admins cadastrados que
	// a Evolution reporta como admin no grupo.
	CountVerifiedAdmins(ctx context.Context, g models.RedesignGroup) (int, error)
}

// NopEvolutionVerifier é um EvolutionVerifier no-op para testes e listagem rápida.
type NopEvolutionVerifier struct{}

func (NopEvolutionVerifier) CountVerifiedAdmins(_ context.Context, _ models.RedesignGroup) (int, error) {
	return 0, nil
}

// cacheEntry é uma entrada de cache de grupos da Evolution.
type cacheEntry struct {
	at     time.Time
	groups []map[string]any
}

// fetchAllCache armazena grupos da Evolution por instância (chave = baseURL|apiKey[:12]|instance).
// Cache de 45s — fetchAllGroups com participantes é pesado.
var fetchAllCache sync.Map

// Service encapsula a lógica de negócio de grupos.
type Service struct {
	store store.Store
}

// New cria um Service.
func New(st store.Store) *Service {
	return &Service{store: st}
}

// EnrichGroup agrega channel_name, account_label, admin_count, verified_admin_count, audience_status.
//
// evolutionVerify: quando true (detalhe do grupo), cruza admins com participantes da Evolution
// usando o verifier. Na listagem use false para evitar N+1 calls à Evolution API.
func (s *Service) EnrichGroup(ctx context.Context, g models.RedesignGroup, evolutionVerify bool, verifier EvolutionVerifier) GroupEnriched {
	adminCount, _ := s.store.CountGroupAdmins(g.ID)
	enriched := GroupEnriched{
		RedesignGroup:      g,
		AdminCount:         adminCount,
		VerifiedAdminCount: adminCount,
	}

	// Conta grupos com o mesmo JID físico (grupo em N canais).
	channelsCount := 0
	if g.JID.Valid && strings.TrimSpace(g.JID.String) != "" {
		channelsCount, _ = s.store.CountGroupsWithSameJID(g.Platform, strings.TrimSpace(g.JID.String))
	} else if g.ChannelID.Valid {
		channelsCount = 1
	}
	enriched.ChannelsCount = channelsCount

	// TODO: cruzar canal / audiência / taxonomia para "perfil" vs "sem_perfil".
	// Por ora listagem não distingue — audiência JSONB é adicionada em sub3-c3 P3.
	enriched.AudienceStatus = "sem_perfil"

	// Label da conta WA vinculada.
	if g.WAAccountID.Valid {
		if acc, err := s.store.GetAccount(g.WAAccountID.Int64); err == nil {
			enriched.AccountLabel = acc.Phone
		}
	}

	// Normaliza invite link WA.
	if g.Platform == "whatsapp" && g.InviteLink.Valid && g.InviteLink.String != "" {
		norm := invitelinks.NormalizeWhatsAppInvite(g.InviteLink.String)
		if norm != g.InviteLink.String {
			enriched.InviteLink = models.NullString{NullString: sql.NullString{String: norm, Valid: true}}
		}
	}

	// Verificação de admins via Evolution (só no detalhe do grupo).
	if evolutionVerify && g.Platform == "whatsapp" && g.JID.Valid && g.JID.String != "" && g.WAAccountID.Valid {
		if verifier != nil {
			verifyCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			if v, err := verifier.CountVerifiedAdmins(verifyCtx, g); err == nil {
				enriched.VerifiedAdminCount = v
			}
			// Se falhar (timeout, evolution offline, etc.) mantém adminCount do banco.
		}
	}

	return enriched
}
