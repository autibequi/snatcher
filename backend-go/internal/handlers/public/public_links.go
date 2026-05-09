package public

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"snatcher/backendv2/internal/invitelinks"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
)

// PublicLinksResolver handles the public-facing GET /g/{slug} redirect.
type PublicLinksResolver struct {
	store store.Store
}

func NewPublicLinksResolver(st store.Store) *PublicLinksResolver {
	return &PublicLinksResolver{store: st}
}

// Resolve godoc
// GET /g/:slug (PUBLICO — sem auth)
func (h *PublicLinksResolver) Resolve(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	link, err := h.store.GetPublicLinkBySlug(slug)
	if err != nil {
		http.Error(w, "Link nao encontrado", http.StatusNotFound)
		return
	}

	var chain []int64
	_ = json.Unmarshal(link.FallbackChain, &chain)
	if len(chain) == 0 {
		http.Error(w, "<html><body><h2>Este canal esta fora do ar, volte logo.</h2></body></html>", http.StatusGone)
		return
	}

	// Resolver destino pelo strategy
	var targetGroupID int64
	switch link.RedirectStrategy {
	case "round_robin":
		idx := link.RoundRobinIdx % len(chain)
		targetGroupID = chain[idx]
		_ = h.store.IncrementRoundRobinIdx(link.ID, (idx+1)%len(chain))
	case "least_full":
		targetGroupID = chain[0]
		minCount := int64(^uint64(0) >> 1)
		for _, gid := range chain {
			g, err := h.store.GetRedesignGroup(gid)
			if err == nil && g.Status == "active" && g.MemberCount < minCount {
				minCount = g.MemberCount
				targetGroupID = gid
			}
		}
	default: // first_active
		targetGroupID = chain[0]
		for _, gid := range chain {
			g, err := h.store.GetRedesignGroup(gid)
			if err == nil && g.Status == "active" {
				targetGroupID = gid
				break
			}
		}
	}

	// Buscar invite_link do grupo (se vazio, tenta Evolution e persiste — mesmo fluxo da página /canal/)
	group, err := h.store.GetRedesignGroup(targetGroupID)
	if err != nil {
		http.Error(w, "Grupo nao encontrado", http.StatusNotFound)
		return
	}
	invite := ""
	if group.InviteLink.Valid {
		invite = strings.TrimSpace(group.InviteLink.String)
	}
	if invite == "" && group.Platform == "whatsapp" && group.JID.Valid && strings.TrimSpace(group.JID.String) != "" && group.WAAccountID.Valid {
		ctx, cancel := context.WithTimeout(r.Context(), 18*time.Second)
		if link, ferr := h.store.FetchAndPersistWhatsAppInvite(ctx, group.ID); ferr == nil && link != "" {
			invite = link
		}
		cancel()
	}
	if invite == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte("<html><body><h2>Canal temporariamente indisponivel, volte logo.</h2></body></html>"))
		return
	}

	// Fecha o loop de atribuição: registra que o link público foi resolvido.
	// Best-effort: erro de update não deve impedir o redirect.
	_ = h.store.IncrementPublicLinkClicks(link.ID)

	url := invite
	if group.Platform == "whatsapp" {
		url = invitelinks.NormalizeWhatsAppInvite(url)
	}
	http.Redirect(w, r, url, http.StatusFound)
}
