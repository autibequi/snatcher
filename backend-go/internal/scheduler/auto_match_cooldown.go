package scheduler

import (
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// BuildDispatchDeliveredMap pré-computa dispatches que tiveram pelo menos um target entregue.
// Cooldown do auto-match só deve bloquear par produto+canal quando houve entrega real —
// não basta existir linha em auto_match_logs (criada ao criar o dispatch).
func BuildDispatchDeliveredMap(st store.Store, recentLogs []models.AutoMatchLog) map[int64]bool {
	uniq := make(map[int64]struct{})
	var ids []int64
	for _, l := range recentLogs {
		if l.DispatchID <= 0 {
			continue
		}
		if _, ok := uniq[l.DispatchID]; ok {
			continue
		}
		uniq[l.DispatchID] = struct{}{}
		ids = append(ids, l.DispatchID)
	}
	return st.DispatchIDsWithDelivered(ids)
}

// CooldownBlocksPair retorna true se produto+canal deve ser ignorado neste ciclo por já ter
// tido dispatch entregue dentro da janela [cutoff, now).
func CooldownBlocksPair(recentLogs []models.AutoMatchLog, productID, channelID int64, cutoff time.Time, delivered map[int64]bool) bool {
	for _, l := range recentLogs {
		if l.ProductID != productID || l.ChannelID != channelID || !l.CreatedAt.After(cutoff) {
			continue
		}
		if delivered[l.DispatchID] {
			return true
		}
	}
	return false
}
