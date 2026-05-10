package admin

import (
	"net/http"
	"os"
	"strings"

	"snatcher/backendv2/internal/store"
)

type BrandHandler struct {
	store store.Store
}

func NewBrandHandler(st store.Store) *BrandHandler {
	return &BrandHandler{store: st}
}

type BrandResponse struct {
	AppName         string `json:"app_name"`
	AppDomain       string `json:"app_domain"`
	PublicURL       string `json:"public_url"`
	LLMProvider     string `json:"llm_provider"`
	GTMContainerID  string `json:"gtm_container_id,omitempty"`
}

// GET /api/brand — retorna configurações de white-label (público, sem auth)
func (h *BrandHandler) Get(w http.ResponseWriter, r *http.Request) {
	cfg, _ := h.store.GetConfig()

	appName := "Snatcher"
	if cfg.AppName.Valid && cfg.AppName.String != "" {
		appName = cfg.AppName.String
	} else if envName := os.Getenv("APP_NAME"); envName != "" {
		appName = envName
	}

	appDomain := ""
	if cfg.AppDomain.Valid && cfg.AppDomain.String != "" {
		appDomain = cfg.AppDomain.String
	} else if envDomain := os.Getenv("APP_DOMAIN"); envDomain != "" {
		appDomain = envDomain
	} else {
		// Extrair do PUBLIC_BASE_URL
		pubURL := os.Getenv("PUBLIC_BASE_URL")
		for _, prefix := range []string{"https://", "http://"} {
			if strings.HasPrefix(pubURL, prefix) {
				appDomain = strings.TrimPrefix(pubURL, prefix)
				break
			}
		}
	}

	llmProvider := "openrouter"
	if cfg.LLMProvider.Valid && cfg.LLMProvider.String != "" {
		llmProvider = cfg.LLMProvider.String
	}

	gtmID := ""
	if cfg.GTMContainerID.Valid {
		gtmID = strings.TrimSpace(cfg.GTMContainerID.String)
	}
	if gtmID == "" {
		gtmID = strings.TrimSpace(os.Getenv("GTM_CONTAINER_ID"))
	}

	writeJSON(w, http.StatusOK, BrandResponse{
		AppName:        appName,
		AppDomain:      appDomain,
		PublicURL:      os.Getenv("PUBLIC_BASE_URL"),
		LLMProvider:    llmProvider,
		GTMContainerID: gtmID,
	})
}
