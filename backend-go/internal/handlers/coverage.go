package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"sync"
	"time"
)

type CoverageHandler struct {
	store store.Store
}

func NewCoverageHandler(s store.Store) *CoverageHandler {
	return &CoverageHandler{store: s}
}

// CoverageMatrixResponse é a resposta para GET /api/coverage
type CoverageMatrixResponse struct {
	Accounts []models.WAAccount           `json:"accounts"`
	Targets  []models.ChannelTarget       `json:"targets"`
	Matrix   [][]string                   `json:"matrix"` // rows=accounts, cols=targets; values="present"|"fallback"|"absent"
	CachedAt time.Time                    `json:"cached_at"`
}

// coverageCache mantém o resultado cacheado por 60s
var (
	coverageCacheMu sync.RWMutex
	coverageCache   *CoverageMatrixResponse
	coverageCacheAt time.Time
)

const coverageCacheTTL = 60 * time.Second

// GetCoverage retorna a matriz de cobertura: quais contas estão em quais grupos
//
//	@Summary      Matriz de cobertura account x target
//	@Description  Retorna lista de contas, lista de targets, e matriz binária de cobertura (present/fallback/absent)
//	@Tags         coverage
//	@Produce      json
//	@Success      200      {object}  CoverageMatrixResponse
//	@Failure      500      {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/coverage [get]
func (h *CoverageHandler) GetCoverage(w http.ResponseWriter, r *http.Request) {
	// Check cache
	coverageCacheMu.RLock()
	if coverageCache != nil && time.Since(coverageCacheAt) < coverageCacheTTL {
		defer coverageCacheMu.RUnlock()
		w.Header().Set("Cache-Control", "public, max-age=60")
		w.Header().Set("X-Cache", "HIT")
		writeJSON(w, http.StatusOK, coverageCache)
		return
	}
	coverageCacheMu.RUnlock()

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Fetch all active accounts
	accounts, err := h.store.ListWAAccounts()
	if err != nil {
		slog.Error("failed to list wa_accounts", "err", err)
		writeErr(w, http.StatusInternalServerError, "failed to fetch accounts")
		return
	}

	// Filter only active accounts
	var activeAccounts []models.WAAccount
	for _, a := range accounts {
		if a.Active {
			activeAccounts = append(activeAccounts, a)
		}
	}

	// Fetch all channel targets
	targets, err := h.store.ListAllChannelTargets()
	if err != nil {
		slog.Error("failed to list channel_targets", "err", err)
		writeErr(w, http.StatusInternalServerError, "failed to fetch targets")
		return
	}

	// Build matrix: for each account, determine coverage status in each target
	matrix := make([][]string, len(activeAccounts))
	for i := range matrix {
		matrix[i] = make([]string, len(targets))
	}

	for accIdx, acc := range activeAccounts {
		for tgtIdx, tgt := range targets {
			// Query channel_target_accounts for this pair
			ctaList, err := h.store.ListAccountsForTarget(tgt.ID)
			if err != nil {
				slog.Warn("failed to list accounts for target", "target_id", tgt.ID, "err", err)
				matrix[accIdx][tgtIdx] = "absent"
				continue
			}

			// Check if this account is in the list
			status := "absent"
			for _, cta := range ctaList {
				if cta.AccountID == acc.ID {
					if cta.Role == "primary" {
						status = "present"
					} else {
						status = "fallback"
					}
					break
				}
			}
			matrix[accIdx][tgtIdx] = status
		}
	}

	// Build response
	_ = ctx // silence unused warning
	resp := &CoverageMatrixResponse{
		Accounts: activeAccounts,
		Targets:  targets,
		Matrix:   matrix,
		CachedAt: time.Now(),
	}

	// Cache the result
	coverageCacheMu.Lock()
	coverageCache = resp
	coverageCacheAt = time.Now()
	coverageCacheMu.Unlock()

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("X-Cache", "MISS")
	writeJSON(w, http.StatusOK, resp)
}

// CoverageSyncRequest é o body para POST /api/coverage/sync
type CoverageSyncRequest struct {
	AccountID int64  `json:"account_id"`
	TargetIDs []int64 `json:"target_ids"`
	Confirmed bool   `json:"confirmed"`
}

// CoverageSyncResponse é a resposta para POST /api/coverage/sync
type CoverageSyncResponse struct {
	Preview        string `json:"preview,omitempty"`
	EstimatedJobs  int    `json:"estimated_jobs,omitempty"`
	JobsEnqueued   int    `json:"jobs_enqueued,omitempty"`
	SkippedTargets []int64 `json:"skipped_targets,omitempty"` // targets where account is already present/fallback
	Message        string `json:"message,omitempty"`
}

// PostCoverageSync handles manual sync requests: preview or execute joining groups
//
//	@Summary      Sincronizar cobertura (prévia ou execução)
//	@Description  Preview dos grupos que serão joinados, ou execução da sincronização com confirmação do user.
//	@Tags         coverage
//	@Accept       json
//	@Produce      json
//	@Param        body  body  CoverageSyncRequest  true  "Account e targets a sincronizar"
//	@Success      200   {object}  CoverageSyncResponse
//	@Failure      400   {object}  object{error=string}
//	@Failure      404   {object}  object{error=string}
//	@Failure      501   {object}  object{message=string}
//	@Failure      500   {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/coverage/sync [post]
func (h *CoverageHandler) PostCoverageSync(w http.ResponseWriter, r *http.Request) {
	var req CoverageSyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate account exists and is active
	acc, err := h.store.GetWAAccount(req.AccountID)
	if err != nil {
		slog.Warn("account not found", "account_id", req.AccountID, "err", err)
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}
	if !acc.Active {
		writeErr(w, http.StatusBadRequest, "account is inactive")
		return
	}

	// Validate targets exist
	var skippedTargets []int64
	for _, targetID := range req.TargetIDs {
		_, err := h.store.GetChannelTarget(targetID)
		if err != nil {
			slog.Warn("target not found", "target_id", targetID, "err", err)
			writeErr(w, http.StatusNotFound, "target not found")
			return
		}

		// Check if account is already present/fallback for this target
		ctaList, err := h.store.ListAccountsForTarget(targetID)
		if err == nil {
			for _, cta := range ctaList {
				if cta.AccountID == req.AccountID {
					skippedTargets = append(skippedTargets, targetID)
					continue
				}
			}
		}
	}

	estimatedJobs := len(req.TargetIDs) - len(skippedTargets)

	if !req.Confirmed {
		// Return preview
		preview := "Account " + acc.Name + " will join " + string(rune(len(req.TargetIDs))) + " groups"
		writeJSON(w, http.StatusOK, CoverageSyncResponse{
			Preview:        preview,
			EstimatedJobs:  estimatedJobs,
			SkippedTargets: skippedTargets,
		})
		return
	}

	// Confirmed: return 501 Not Implemented (Evolution doesn't support join group API yet)
	writeJSON(w, http.StatusNotImplemented, CoverageSyncResponse{
		Message: "Evolution API does not yet support automatic group joining. Please join groups manually via WhatsApp and then re-check the coverage matrix.",
	})
}
