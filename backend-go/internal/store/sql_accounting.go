package store

import (
	"fmt"
	"snatcher/backendv2/internal/models"
	"time"

	"github.com/lib/pq"
)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

func (s *SQLStore) GetConfig() (models.AppConfig, error) {
	var c models.AppConfig
	err := s.db.Get(&c, `SELECT * FROM appconfig WHERE id = 1`)
	return c, err
}

func (s *SQLStore) TouchAutoMatchWorkerRun(at time.Time) error {
	_, err := s.db.Exec(`UPDATE appconfig SET auto_match_last_worker_run_at = $1 WHERE id = 1`, at)
	return err
}

func (s *SQLStore) UpdateConfig(cfg models.AppConfig) error {
	_, err := s.db.NamedExec(`
		UPDATE appconfig SET
			wa_provider=:wa_provider, wa_base_url=:wa_base_url, wa_api_key=:wa_api_key,
			wa_instance=:wa_instance, global_interval=:global_interval,
			send_start_hour=:send_start_hour, send_end_hour=:send_end_hour,
			dispatch_send_window_enabled=:dispatch_send_window_enabled,
			dispatch_send_timezone=:dispatch_send_timezone,
			ml_client_id=:ml_client_id, ml_client_secret=:ml_client_secret,
			wa_group_prefix=:wa_group_prefix, alert_phone=:alert_phone,
			use_short_links=:use_short_links,
			llm_provider=:llm_provider, llm_api_key=:llm_api_key,
			llm_base_url=:llm_base_url, llm_model=:llm_model,
			llm_ollama_base_url=:llm_ollama_base_url, llm_ollama_model=:llm_ollama_model,
			llm_vllm_base_url=:llm_vllm_base_url, llm_vllm_model=:llm_vllm_model,
			llm_vllm_api_key=:llm_vllm_api_key,
			llm_openrouter_fallback_model=:llm_openrouter_fallback_model,
			llm_reasoning_ollama=:llm_reasoning_ollama,
			llm_reasoning_vllm=:llm_reasoning_vllm,
			llm_reasoning_openrouter=:llm_reasoning_openrouter,
			llm_temperature=:llm_temperature,
			app_name=:app_name, app_domain=:app_domain,
			gtm_container_id=:gtm_container_id,
			auto_match_enabled=:auto_match_enabled,
			auto_match_threshold=:auto_match_threshold,
			auto_match_max_per_run=:auto_match_max_per_run,
			full_auto_mode=:full_auto_mode,
			notify_approval_webhook=:notify_approval_webhook,
			auto_match_only_curated=:auto_match_only_curated,
			auto_match_interval_seconds=:auto_match_interval_seconds,
			auto_match_product_cursor=:auto_match_product_cursor,
			curation_script_confidence_min=:curation_script_confidence_min,
			curation_llm_confidence_threshold=:curation_llm_confidence_threshold,
			curation_heuristic_interval_seconds=:curation_heuristic_interval_seconds,
			curation_heuristic_batch_size=:curation_heuristic_batch_size,
			curation_heuristic_last_id=:curation_heuristic_last_id,
			curation_heuristic_last_run_at=:curation_heuristic_last_run_at,
			interval_between_groups_sec=:interval_between_groups_sec,
			interval_between_channels_sec=:interval_between_channels_sec,
			daily_limit_per_account=:daily_limit_per_account,
			rotate_accounts=:rotate_accounts,
			dispatch_min_interval_ms=:dispatch_min_interval_ms,
			dispatch_wa_rr_cursor=:dispatch_wa_rr_cursor,
			dispatch_max_per_group_per_hour=:dispatch_max_per_group_per_hour,
			notifications_group_id=:notifications_group_id
		WHERE id = 1`, cfg)
	return err
}

// SetDispatchWaRRCursor persiste só o cursor WA round-robin (dispatch worker).
func (s *SQLStore) SetDispatchWaRRCursor(cursor int) error {
	_, err := s.db.Exec(`UPDATE appconfig SET dispatch_wa_rr_cursor = $1 WHERE id = 1`, cursor)
	return err
}

// ApplyGlobalDailyLimitToAccounts aplica o limite diário configurado em appconfig a todas as contas.
func (s *SQLStore) ApplyGlobalDailyLimitToAccounts(limit int) error {
	if _, err := s.db.Exec(`UPDATE waaccount SET daily_limit = $1`, limit); err != nil {
		return err
	}
	_, err := s.db.Exec(`UPDATE tgaccount SET daily_limit = $1`, limit)
	return err
}

// AutoMatchProductChannelInFlight implementa anti-duplicata antes de CreateDispatch.
func (s *SQLStore) AutoMatchProductChannelInFlight(productID, channelID int64) (bool, error) {
	var exists bool
	err := s.db.Get(&exists, `
		SELECT EXISTS (
			SELECT 1 FROM dispatches d
			INNER JOIN dispatch_targets dt ON dt.dispatch_id = d.id
			INNER JOIN groups g ON g.id = dt.group_id
			WHERE d.product_id IS NOT NULL AND d.product_id = $1 AND g.channel_id = $2
			  AND (
				  d.status IN ('queued','pending_approval','sending')
				  OR dt.status IN ('pending','sending')
			  )
		)`, productID, channelID)
	return exists, err
}

// AutoMatchHasRecentPairLog é verdadeiro se o par produto+canal está em cooldown:
// linha em auto_match_logs OU dispatch auto-match criado no intervalo (fallback se log falhou ao inserir).
func (s *SQLStore) AutoMatchHasRecentPairLog(productID, channelID int64, since time.Time) (bool, error) {
	var blocked bool
	err := s.db.Get(&blocked, `
		SELECT (
			EXISTS (
				SELECT 1 FROM auto_match_logs
				WHERE product_id = $1 AND channel_id = $2 AND created_at >= $3
			)
			OR EXISTS (
				SELECT 1 FROM dispatches d
				INNER JOIN dispatch_targets dt ON dt.dispatch_id = d.id
				INNER JOIN groups g ON g.id = dt.group_id
				WHERE d.product_id IS NOT NULL AND d.product_id = $1 AND g.channel_id = $2
				  AND d.composed_by = 'auto-match'
				  AND d.created_at >= $3
			)
		)`, productID, channelID, since)
	return blocked, err
}

// CountAutoMatchDispatchesSince conta dispatches criados pelo auto-match na janela (KPI / auditoria).
// Exclui rascunho — alinhado à timeline em GET /api/auto-match (logs).
func (s *SQLStore) CountAutoMatchDispatchesSince(since time.Time) (int64, error) {
	var n int64
	err := s.db.Get(&n, `
		SELECT COUNT(*) FROM dispatches
		WHERE composed_by = 'auto-match'
		  AND created_at >= $1
		  AND status <> 'draft'`, since)
	return n, err
}

func (s *SQLStore) GetChannelStats(channelID int64) (ChannelStats, error) {
	var stats ChannelStats

	// Grupos do canal
	var groupIDs []int64
	if err := s.db.Select(&groupIDs, `SELECT id FROM groups WHERE channel_id = $1 AND status <> 'deleted'`, channelID); err != nil || len(groupIDs) == 0 {
		return stats, nil
	}

	arr := pq.Array(groupIDs)

	// Cliques totais
	_ = s.db.Get(&stats.TotalClicks, `
		SELECT COALESCE(SUM(dt.click_count), 0)
		FROM dispatch_targets dt
		WHERE dt.group_id = ANY($1)`, arr)

	// Disparos últimos 7 dias
	_ = s.db.Get(&stats.Dispatches7d, `
		SELECT COUNT(DISTINCT d.id)
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		WHERE dt.group_id = ANY($1)
		  AND d.created_at >= now() - interval '7 days'`, arr)

	// Produtos únicos disparados
	_ = s.db.Get(&stats.ProductCount, `
		SELECT COUNT(DISTINCT d.product_id)
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		WHERE dt.group_id = ANY($1)
		  AND d.product_id IS NOT NULL`, arr)

	// Cliques últimas 24h
	_ = s.db.Get(&stats.Clicks24h, `
		SELECT COALESCE(SUM(dt.click_count), 0)
		FROM dispatch_targets dt
		WHERE dt.group_id = ANY($1)
		  AND dt.delivered_at >= now() - interval '24 hours'`, arr)

	// Taxa de entrega (% targets delivered)
	_ = s.db.Get(&stats.DeliveryRate, `
		SELECT COALESCE(
			COUNT(*) FILTER (WHERE dt.status = 'delivered') * 100.0 / NULLIF(COUNT(*), 0),
			0
		)
		FROM dispatch_targets dt
		WHERE dt.group_id = ANY($1)`, arr)

	// Série diária
	_ = s.db.Select(&stats.Series, `
		SELECT to_char(d.created_at::date, 'Dy') AS day,
		       COUNT(DISTINCT d.id)::int AS value
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		WHERE dt.group_id = ANY($1)
		  AND d.created_at >= now() - interval '7 days'
		GROUP BY d.created_at::date
		ORDER BY d.created_at::date`, arr)

	return stats, nil
}

// GetHistoricalCTRForGroup calcula CTR = SUM(click_count) / COUNT(dispatches) para o
// grupo no contexto da categoria do produto (match via tags JSONB do catalog product).
// Retorna nil se o número de dispatches qualificados for menor que minDispatches.
//
// Tabelas: dispatch_targets (group_id, click_count, dispatch_id),
//
//	dispatches (id, product_id), catalogproduct (id, tags).
//
// Nota: category é comparada contra tags JSONB de catalogproduct via operador @>.
func (s *SQLStore) GetHistoricalCTRForGroup(groupID int64, category string, minDispatches int) (*float64, error) {
	if minDispatches <= 0 {
		minDispatches = 5
	}
	var result struct {
		TotalDispatches int   `db:"total_dispatches"`
		TotalClicks     int64 `db:"total_clicks"`
	}
	err := s.db.Get(&result, `
		SELECT COUNT(dt.id)       AS total_dispatches,
		       COALESCE(SUM(dt.click_count), 0) AS total_clicks
		FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		JOIN catalogproduct cp ON cp.id = d.product_id
		WHERE dt.group_id = $1
		  AND ($2 = '' OR cp.tags::jsonb @> to_jsonb($2::text))
	`, groupID, category)
	if err != nil {
		return nil, err
	}
	if result.TotalDispatches < minDispatches {
		return nil, nil //nolint:nilnil
	}
	ctr := float64(result.TotalClicks) / float64(result.TotalDispatches)
	return &ctr, nil
}

// ListAccountsV2 retorna todas as contas WA v2 (tabela accounts) ordenadas por id.
func (s *SQLStore) ListAccountsV2() ([]models.AccountV2, error) {
	var out []models.AccountV2
	err := s.db.Select(&out, `SELECT id, phone, modem_id, status, daily_send_quota, last_sent_at, consecutive_failures FROM accounts ORDER BY id`)
	return out, err
}

// GetAccountV2 retorna uma conta WA v2 pelo id (tabela accounts).
func (s *SQLStore) GetAccountV2(id int64) (models.AccountV2, error) {
	var a models.AccountV2
	err := s.db.Get(&a, `SELECT id, phone, modem_id, status, daily_send_quota, last_sent_at, consecutive_failures FROM accounts WHERE id = $1`, id)
	return a, err
}

// CreateAccountV2 insere uma nova conta WA na tabela accounts.
func (s *SQLStore) CreateAccountV2(phone string, modemID int64, quota int) (int64, error) {
	if quota <= 0 {
		quota = 20
	}
	var id int64
	err := s.db.QueryRowx(`
		INSERT INTO accounts (phone, modem_id, status, daily_send_quota)
		VALUES ($1, $2, 'primary', $3)
		RETURNING id
	`, phone, modemID, quota).Scan(&id)
	return id, err
}

// DeleteAccountV2 remove uma conta WA v2 pelo id.
func (s *SQLStore) DeleteAccountV2(id int64) error {
	_, err := s.db.Exec(`DELETE FROM accounts WHERE id = $1`, id)
	return err
}

// UpdateAccountV2 atualiza status e quota de uma conta WA v2.
func (s *SQLStore) UpdateAccountV2(id int64, status string, quota int) error {
	_, err := s.db.Exec(`
		UPDATE accounts SET status=$1, daily_send_quota=$2, status_changed_at=now() WHERE id=$3
	`, status, quota, id)
	return err
}

func (s *SQLStore) DeleteTGAccount(id int64) error {
	_, err := s.db.Exec(`DELETE FROM tgaccount WHERE id = $1`, id)
	return err
}

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

// CheckAndIncrementTG verifies if the TG account has reached its daily limit before sending.
// Returns error if daily_limit exceeded; atomically increments sent_today if OK.
func (s *SQLStore) CheckAndIncrementTG(accountID int64) error {
	var row struct {
		SentToday  int `db:"sent_today"`
		DailyLimit int `db:"daily_limit"`
	}
	if err := s.db.Get(&row, `SELECT sent_today, daily_limit FROM tgaccount WHERE id = $1`, accountID); err != nil {
		return fmt.Errorf("throttle: TG account %d not found: %w", accountID, err)
	}
	if row.DailyLimit > 0 && row.SentToday >= row.DailyLimit {
		return fmt.Errorf("throttle: TG account %d reached daily limit (%d/%d)", accountID, row.SentToday, row.DailyLimit)
	}
	_, err := s.db.Exec(`UPDATE tgaccount SET sent_today = sent_today + 1 WHERE id = $1`, accountID)
	if err != nil {
		return fmt.Errorf("throttle: failed to increment sent_today: %w", err)
	}
	return nil
}
