package admin

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strconv"
)

type CrawlLogsHandler struct {
	store store.Store
}

func NewCrawlLogs(st store.Store) *CrawlLogsHandler {
	return &CrawlLogsHandler{store: st}
}

func (h *CrawlLogsHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit == 0 {
		limit = 50
	}
	var termID int64
	if s := q.Get("search_term_id"); s != "" {
		termID, _ = strconv.ParseInt(s, 10, 64)
	}
	logs, err := h.store.ListCrawlLogs(termID, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if logs == nil {
		logs = []models.CrawlLog{}
	}
	writeJSON(w, http.StatusOK, logs)
}
