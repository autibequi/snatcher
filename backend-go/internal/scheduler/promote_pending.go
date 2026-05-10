package scheduler

import (
	"context"
	"log/slog"

	"snatcher/backendv2/internal/store"
)

// RunPromotePendingApproval passa dispatches pending_approval → queued quando full_auto_mode=true.
// Antes isto só acontecia se o Jonfrey estivesse ligado com a ação auto_release_pending — ficava preso para sempre.
func RunPromotePendingApproval(ctx context.Context, st store.Store) {
	select {
	case <-ctx.Done():
		return
	default:
	}
	n, err := st.PromotePendingApprovalToQueued()
	if err != nil {
		slog.Warn("promote pending approval", "err", err)
		return
	}
	if n > 0 {
		slog.Info("promoted pending_approval → queued (full_auto)", "dispatches", n)
	}
}
