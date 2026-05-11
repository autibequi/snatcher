package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"snatcher/backendv2/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

func (s *SQLStore) listChannelsUnmarshal(out []models.Channel) []models.Channel {
	for i := range out {
		_ = out[i].UnmarshalAudience()
	}
	return out
}

func (s *SQLStore) ListChannels() ([]models.Channel, error) {
	var out []models.Channel
	err := s.db.Select(&out, `SELECT * FROM channel ORDER BY id`)
	if err != nil {
		return nil, err
	}
	return s.listChannelsUnmarshal(out), nil
}

func (s *SQLStore) GetChannel(id int64) (models.Channel, error) {
	var c models.Channel
	err := s.db.Get(&c, `SELECT * FROM channel WHERE id = $1`, id)
	if err != nil {
		return c, err
	}
	_ = c.UnmarshalAudience()
	return c, nil
}

func (s *SQLStore) GetChannelBySlug(slug string) (models.Channel, error) {
	var c models.Channel
	err := s.db.Get(&c, `SELECT * FROM channel WHERE slug = $1`, slug)
	if err != nil {
		return c, err
	}
	_ = c.UnmarshalAudience()
	return c, nil
}

func (s *SQLStore) CreateChannel(c models.Channel) (int64, error) {
	if err := c.MarshalAudience(); err != nil {
		return 0, err
	}
	return insertReturningID(s.db, `
		INSERT INTO channel (name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active, audience, member_count, ctr_30d, cvr_30d, revenue_30d)
		VALUES (:name, :description, :slug, :message_template, :send_start_hour, :send_end_hour,
			:digest_mode, :digest_max_items, :active, :audience, :member_count, :ctr_30d, :cvr_30d, :revenue_30d)`, c)
}

func (s *SQLStore) UpdateChannel(c models.Channel) error {
	if err := c.MarshalAudience(); err != nil {
		return err
	}
	_, err := s.db.NamedExec(`
		UPDATE channel SET name=:name, description=:description, slug=:slug,
			message_template=:message_template, send_start_hour=:send_start_hour,
			send_end_hour=:send_end_hour, digest_mode=:digest_mode,
			digest_max_items=:digest_max_items, active=:active,
			audience=:audience, member_count=:member_count,
			ctr_30d=:ctr_30d, cvr_30d=:cvr_30d, revenue_30d=:revenue_30d
		WHERE id = :id`, c)
	return err
}

func (s *SQLStore) DeleteChannel(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channel WHERE id = $1`, id)
	return err
}

// ListChannelsByCategory retorna canais ativos cuja audience contém a categoria via índice GIN.
func (s *SQLStore) ListChannelsByCategory(category string) ([]models.Channel, error) {
	rows := []models.Channel{}
	err := s.db.Select(&rows, `
		SELECT id, name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active, created_at,
			audience, member_count, ctr_30d, cvr_30d, revenue_30d
		FROM channel
		WHERE active = true
		  AND ($1 = '' OR audience->'categories' ? $1)
		ORDER BY id
	`, category)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		_ = rows[i].UnmarshalAudience()
	}
	return rows, nil
}

// ListChannelsForProduct retorna canais compatíveis com o produto via filtros de audience.
// Filtra channels cujo audience.categories contém category, price está no range e drop >= min_drop.
func (s *SQLStore) ListChannelsForProduct(category, brand string, price, drop float64) ([]models.Channel, error) {
	rows := []models.Channel{}
	err := s.db.Select(&rows, `
		SELECT id, name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active, created_at,
			audience, member_count, ctr_30d, cvr_30d, revenue_30d
		FROM channel
		WHERE active = true
		  AND ($1 = '' OR audience->'categories' ? $1)
		  AND ($3 = 0 OR (audience->>'min_price')::numeric <= $3)
		  AND ($3 = 0 OR (audience->>'max_price')::numeric = 0 OR (audience->>'max_price')::numeric >= $3)
		  AND ($4 = 0 OR (audience->>'min_drop')::numeric <= $4)
		ORDER BY id
	`, category, brand, price, drop)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		_ = rows[i].UnmarshalAudience()
	}
	return rows, nil
}

func (s *SQLStore) ListChannelTargets(channelID int64) ([]models.ChannelTarget, error) {
	var out []models.ChannelTarget
	err := s.db.Select(&out, `SELECT * FROM channeltarget WHERE channel_id = $1 ORDER BY id`, channelID)
	return out, err
}

func (s *SQLStore) CreateChannelTarget(t models.ChannelTarget) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO channeltarget (channel_id, provider, chat_id, name, invite_url, status)
		VALUES (:channel_id, :provider, :chat_id, :name, :invite_url, :status)`, t)
}

func (s *SQLStore) UpdateChannelTarget(t models.ChannelTarget) error {
	_, err := s.db.NamedExec(`
		UPDATE channeltarget SET provider=:provider, chat_id=:chat_id, name=:name,
			invite_url=:invite_url, status=:status
		WHERE id = :id`, t)
	return err
}

func (s *SQLStore) DeleteChannelTarget(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channeltarget WHERE id = $1`, id)
	return err
}

// GetChannelTarget retorna um target específico pelo ID.
func (s *SQLStore) GetChannelTarget(id int64) (models.ChannelTarget, error) {
	var t models.ChannelTarget
	err := s.db.Get(&t, `SELECT * FROM channeltarget WHERE id = $1`, id)
	return t, err
}

// ListAllChannelTargets retorna TODOS os channel targets (sem filtro de channel_id).
func (s *SQLStore) ListAllChannelTargets() ([]models.ChannelTarget, error) {
	var out []models.ChannelTarget
	err := s.db.Select(&out, `SELECT * FROM channeltarget ORDER BY id`)
	return out, err
}

func (s *SQLStore) ListChannelRules(channelID int64) ([]models.ChannelRule, error) {
	var out []models.ChannelRule
	err := s.db.Select(&out, `SELECT * FROM channelrule WHERE channel_id = $1 ORDER BY id`, channelID)
	return out, err
}

func (s *SQLStore) CreateChannelRule(r models.ChannelRule) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO channelrule (channel_id, match_type, match_value, max_price,
			notify_new, notify_drop, notify_lowest, drop_threshold, active)
		VALUES (:channel_id, :match_type, :match_value, :max_price,
			:notify_new, :notify_drop, :notify_lowest, :drop_threshold, :active)`, r)
}

func (s *SQLStore) UpdateChannelRule(r models.ChannelRule) error {
	_, err := s.db.NamedExec(`
		UPDATE channelrule SET match_type=:match_type, match_value=:match_value,
			max_price=:max_price, notify_new=:notify_new, notify_drop=:notify_drop,
			notify_lowest=:notify_lowest, drop_threshold=:drop_threshold, active=:active
		WHERE id = :id`, r)
	return err
}

func (s *SQLStore) DeleteChannelRule(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channelrule WHERE id = $1`, id)
	return err
}

func (s *SQLStore) GetChannelAutomation(channelID int64) (*models.ChannelAutomation, error) {
	var a models.ChannelAutomation
	err := s.db.Get(&a, `
		SELECT ca.*, c.name AS channel_name
		FROM channel_automations ca
		JOIN channel c ON c.id = ca.channel_id
		WHERE ca.channel_id = $1`, channelID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &a, err
}

func (s *SQLStore) UpsertChannelAutomation(a models.ChannelAutomation) error {
	_, err := s.db.NamedExec(`
		INSERT INTO channel_automations
			(channel_id, enabled, auto_match_enabled, threshold, max_per_run, cooldown_hours,
			 events_enabled, notify_new, notify_drop, notify_lowest, drop_threshold,
			 match_type, match_value, max_price, paused_until,
			 max_groups_per_dispatch, auto_match_next_group_idx)
		VALUES
			(:channel_id, :enabled, :auto_match_enabled, :threshold, :max_per_run, :cooldown_hours,
			 :events_enabled, :notify_new, :notify_drop, :notify_lowest, :drop_threshold,
			 :match_type, :match_value, :max_price, :paused_until,
			 :max_groups_per_dispatch, :auto_match_next_group_idx)
		ON CONFLICT (channel_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			auto_match_enabled = EXCLUDED.auto_match_enabled,
			threshold = EXCLUDED.threshold,
			max_per_run = EXCLUDED.max_per_run,
			cooldown_hours = EXCLUDED.cooldown_hours,
			events_enabled = EXCLUDED.events_enabled,
			notify_new = EXCLUDED.notify_new,
			notify_drop = EXCLUDED.notify_drop,
			notify_lowest = EXCLUDED.notify_lowest,
			drop_threshold = EXCLUDED.drop_threshold,
			match_type = EXCLUDED.match_type,
			match_value = EXCLUDED.match_value,
			max_price = EXCLUDED.max_price,
			paused_until = EXCLUDED.paused_until,
			max_groups_per_dispatch = EXCLUDED.max_groups_per_dispatch,
			auto_match_next_group_idx = channel_automations.auto_match_next_group_idx,
			updated_at = now()`, a)
	return err
}

// UpdateAutoMatchNextGroupIdx atualiza só o cursor de rotação de grupos (worker auto-match).
func (s *SQLStore) UpdateAutoMatchNextGroupIdx(channelID int64, idx int) error {
	_, err := s.db.Exec(`
		UPDATE channel_automations SET auto_match_next_group_idx = $2, updated_at = now()
		WHERE channel_id = $1`, channelID, idx)
	return err
}

func (s *SQLStore) ListChannelAutomations(enabledOnly bool) ([]models.ChannelAutomation, error) {
	var out []models.ChannelAutomation
	q := `SELECT ca.*, c.name AS channel_name
		  FROM channel_automations ca
		  JOIN channel c ON c.id = ca.channel_id`
	if enabledOnly {
		q += ` WHERE ca.enabled = TRUE`
	}
	q += ` ORDER BY c.name`
	err := s.db.Select(&out, q)
	return out, err
}

func (s *SQLStore) ListAutoMatchLogsByChannel(channelID int64, limit int) ([]models.AutoMatchLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []models.AutoMatchLog
	err := s.db.Select(&out, `
		SELECT l.id, l.product_id, l.channel_id, l.dispatch_id, l.score, l.created_at,
		       COALESCE(p.canonical_name, '') AS product_name,
		       COALESCE(ch.name, '') AS channel_name,
		       COALESCE(
		           (SELECT STRING_AGG(g.name, ', ' ORDER BY g.name)
		            FROM dispatch_targets dt
		            JOIN groups g ON g.id = dt.group_id
		            WHERE dt.dispatch_id = l.dispatch_id),
		           ''
		       ) AS group_names
		FROM auto_match_logs l
		LEFT JOIN catalogproduct p ON p.id = l.product_id
		LEFT JOIN channel ch ON ch.id = l.channel_id
		WHERE l.channel_id = $1
		ORDER BY l.created_at DESC
		LIMIT $2`, channelID, limit)
	return out, err
}

func (s *SQLStore) WasSentRecently(productID, targetID int64, since time.Time) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM sentmessagev2 WHERE catalog_product_id = $1 AND channel_target_id = $2 AND sent_at >= $3`,
		productID, targetID, since)
	return count > 0, err
}

func (s *SQLStore) RecordSent(sv models.SentMessageV2) error {
	_, err := s.db.NamedExec(`
		INSERT INTO sentmessagev2 (catalog_product_id, channel_target_id, is_drop)
		VALUES (:catalog_product_id, :channel_target_id, :is_drop)`, sv)
	return err
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

func (s *SQLStore) CreateBroadcast(b models.BroadcastMessage) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO broadcastmessage (text, image_url, channel_ids, status)
		VALUES (:text, :image_url, :channel_ids, :status)`, b)
}

func (s *SQLStore) UpdateBroadcast(b models.BroadcastMessage) error {
	_, err := s.db.NamedExec(`
		UPDATE broadcastmessage SET status=:status, sent_count=:sent_count,
			sent_at=:sent_at, error_msg=:error_msg
		WHERE id = :id`, b)
	return err
}

func (s *SQLStore) ListBroadcasts(limit int) ([]models.BroadcastMessage, error) {
	var out []models.BroadcastMessage
	err := s.db.Select(&out,
		`SELECT * FROM broadcastmessage ORDER BY created_at DESC LIMIT $1`, limit)
	return out, err
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

func (s *SQLStore) CountClicksByProduct(productID int64) (int64, error) {
	var count int64
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM clicklog WHERE product_id = $1`, productID)
	return count, err
}

func (s *SQLStore) InsertClickLog(l models.ClickLog) error {
	_, err := s.db.NamedExec(`
		INSERT INTO clicklog (product_id, ip_hash, user_agent, referrer)
		VALUES (:product_id, :ip_hash, :user_agent, :referrer)`, l)
	return err
}

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroups() ([]models.Group, error) {
	var out []models.Group
	err := s.db.Select(&out, `SELECT * FROM "group" ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetGroup(id int64) (models.Group, error) {
	var g models.Group
	err := s.db.Get(&g, `SELECT * FROM "group" WHERE id = $1`, id)
	return g, err
}

func (s *SQLStore) ListProductsByGroup(groupID int64, limit int) ([]models.Product, error) {
	var out []models.Product
	err := s.db.Select(&out,
		`SELECT * FROM product WHERE group_id = $1 ORDER BY found_at DESC LIMIT $2`, groupID, limit)
	return out, err
}

func (s *SQLStore) GetProductByShortID(shortID string) (models.Product, bool, error) {
	var p models.Product
	err := s.db.Get(&p, `SELECT * FROM product WHERE short_id = $1 LIMIT 1`, shortID)
	if err == sql.ErrNoRows {
		return p, false, nil
	}
	return p, err == nil, err
}

// ---------------------------------------------------------------------------
// TelegramChat
// ---------------------------------------------------------------------------

func (s *SQLStore) UpsertTelegramChat(c models.TelegramChat) error {
	_, err := s.db.NamedExec(`
		INSERT INTO telegramchat (chat_id, type, title, username, member_count, is_admin)
		VALUES (:chat_id, :type, :title, :username, :member_count, :is_admin)
		ON CONFLICT(chat_id) DO UPDATE SET
			title=excluded.title, username=excluded.username,
			member_count=excluded.member_count, is_admin=excluded.is_admin,
			last_seen_at=CURRENT_TIMESTAMP`, c)
	return err
}

func (s *SQLStore) ListTelegramChats() ([]models.TelegramChat, error) {
	var out []models.TelegramChat
	err := s.db.Select(&out, `SELECT * FROM telegramchat ORDER BY last_seen_at DESC`)
	return out, err
}

func (s *SQLStore) GetAnalyticsSummary(since time.Time, days int) (map[string]any, error) {
	var total, unique int64
	// Soma clicks legados (clicklog) + novos (shortlink_clicks)
	_ = s.db.Get(&total, `
		SELECT COALESCE((SELECT COUNT(*) FROM clicklog WHERE clicked_at >= $1), 0)
		     + COALESCE((SELECT COUNT(*) FROM shortlink_clicks WHERE clicked_at >= $1), 0)`, since)
	_ = s.db.Get(&unique, `
		SELECT COUNT(DISTINCT ip_hash) FROM (
			SELECT ip_hash FROM clicklog WHERE clicked_at >= $1
			UNION ALL
			SELECT ip_hash FROM shortlink_clicks WHERE clicked_at >= $1
		) u`, since)

	type dailyRow struct {
		Day    string `db:"day"`
		Clicks int    `db:"clicks"`
	}
	var daily []dailyRow
	_ = s.db.Select(&daily, `
		SELECT day, SUM(clicks) AS clicks FROM (
			SELECT TO_CHAR(clicked_at, 'YYYY-MM-DD') AS day, COUNT(*) AS clicks
			FROM clicklog WHERE clicked_at >= $1 GROUP BY day
			UNION ALL
			SELECT TO_CHAR(clicked_at, 'YYYY-MM-DD') AS day, COUNT(*) AS clicks
			FROM shortlink_clicks WHERE clicked_at >= $1 GROUP BY day
		) u GROUP BY day ORDER BY day`, since)

	type sourceRow struct {
		Source string `db:"source"`
		Clicks int    `db:"clicks"`
	}
	var bySource []sourceRow
	_ = s.db.Select(&bySource, `
		SELECT source, SUM(clicks)::bigint AS clicks FROM (
			SELECT p.source, COUNT(*)::bigint AS clicks FROM clicklog c
			JOIN product p ON c.product_id = p.id
			WHERE c.clicked_at >= $1 GROUP BY p.source
			UNION ALL
			SELECT COALESCE(NULLIF(TRIM(sc.source), ''), '(sem fonte)') AS source, COUNT(*)::bigint AS clicks
			FROM shortlink_clicks sc WHERE sc.clicked_at >= $1
			GROUP BY COALESCE(NULLIF(TRIM(sc.source), ''), '(sem fonte)')
		) u GROUP BY source ORDER BY clicks DESC`, since)

	type topRow struct {
		ID     int64   `db:"id" json:"id"`
		Title  string  `db:"title" json:"title"`
		Source string  `db:"source" json:"source"`
		Price  float64 `db:"price" json:"price"`
		Clicks int     `db:"clicks" json:"clicks"`
	}
	var topProducts []topRow
	_ = s.db.Select(&topProducts, `
		SELECT id, title, source, price, clicks FROM (
			SELECT p.id, p.title, p.source, p.price, COUNT(*)::bigint AS clicks
			FROM clicklog c JOIN product p ON c.product_id = p.id
			WHERE c.clicked_at >= $1 GROUP BY p.id, p.title, p.source, p.price
			UNION ALL
			SELECT cp.id, cp.canonical_name AS title,
				COALESCE(cp.lowest_price_source, '') AS source,
				COALESCE(cp.lowest_price, 0)::float8 AS price,
				COUNT(*)::bigint AS clicks
			FROM shortlink_clicks sc
			JOIN catalogproduct cp ON sc.product_id = cp.id
			WHERE sc.clicked_at >= $1 AND sc.product_id IS NOT NULL
			GROUP BY cp.id, cp.canonical_name, cp.lowest_price_source, cp.lowest_price
		) top_products_union ORDER BY clicks DESC LIMIT 10`, since)

	var catalogTotal, catalogNew, variantsTotal, messagesSent int64
	_ = s.db.Get(&catalogTotal, `SELECT COUNT(*) FROM catalogproduct`)
	_ = s.db.Get(&catalogNew, `SELECT COUNT(*) FROM catalogproduct WHERE created_at >= $1`, since)
	_ = s.db.Get(&variantsTotal, `SELECT COUNT(*) FROM catalogvariant`)
	_ = s.db.Get(&messagesSent, `SELECT COUNT(*) FROM sentmessagev2 WHERE sent_at >= $1`, since)

	dailyOut := make([]map[string]any, 0, len(daily))
	for _, d := range daily {
		dailyOut = append(dailyOut, map[string]any{"date": d.Day, "clicks": d.Clicks})
	}
	sourceOut := make([]map[string]any, 0, len(bySource))
	for _, s := range bySource {
		sourceOut = append(sourceOut, map[string]any{"source": s.Source, "clicks": s.Clicks})
	}
	if topProducts == nil {
		topProducts = []topRow{}
	}

	type channelAggRow struct {
		ID     int64  `db:"id"`
		Name   string `db:"name"`
		Clicks int64  `db:"clicks"`
	}
	var byChannel []channelAggRow
	_ = s.db.Select(&byChannel, `
		SELECT ch.id, ch.name, COUNT(*)::bigint AS clicks
		FROM shortlink_clicks sc
		JOIN channel ch ON ch.id = sc.channel_id
		WHERE sc.clicked_at >= $1 AND sc.channel_id IS NOT NULL
		GROUP BY ch.id, ch.name
		ORDER BY clicks DESC
		LIMIT 15`, since)

	type groupAggRow struct {
		ID     int64   `db:"id"`
		Name   string  `db:"name"`
		Clicks float64 `db:"clicks"`
	}
	var byGroup []groupAggRow
	_ = s.db.Select(&byGroup, `
		WITH parts AS (
			SELECT sc.id, sc.dispatch_id,
				GREATEST(
					(SELECT COUNT(*)::bigint FROM dispatch_targets dt2 WHERE dt2.dispatch_id = sc.dispatch_id),
					1
				)::float8 AS n_targets
			FROM shortlink_clicks sc
			WHERE sc.clicked_at >= $1 AND sc.dispatch_id IS NOT NULL
		)
		SELECT g.id, g.name, SUM(1.0 / parts.n_targets)::float8 AS clicks
		FROM parts
		JOIN dispatch_targets dt ON dt.dispatch_id = parts.dispatch_id
		JOIN groups g ON g.id = dt.group_id
		GROUP BY g.id, g.name
		ORDER BY SUM(1.0 / parts.n_targets) DESC NULLS LAST
		LIMIT 15`, since)

	type categoryAggRow struct {
		ID     int64  `db:"id"`
		Name   string `db:"name"`
		Slug   string `db:"slug"`
		Clicks int64  `db:"clicks"`
	}
	var byCategory []categoryAggRow
	_ = s.db.Select(&byCategory, `
		SELECT t.id, t.name, t.slug, COUNT(*)::bigint AS clicks
		FROM shortlink_clicks sc
		JOIN catalogproduct_taxonomy cpt ON cpt.product_id = sc.product_id AND cpt.role = 'primary_category'
		JOIN taxonomy t ON t.id = cpt.taxonomy_id
		WHERE sc.clicked_at >= $1 AND sc.product_id IS NOT NULL
		GROUP BY t.id, t.name, t.slug
		ORDER BY clicks DESC
		LIMIT 15`, since)

	channelOut := make([]map[string]any, 0, len(byChannel))
	for _, ch := range byChannel {
		channelOut = append(channelOut, map[string]any{"id": ch.ID, "name": ch.Name, "clicks": ch.Clicks})
	}
	groupOut := make([]map[string]any, 0, len(byGroup))
	for _, g := range byGroup {
		groupOut = append(groupOut, map[string]any{"id": g.ID, "name": g.Name, "clicks": g.Clicks})
	}
	categoryOut := make([]map[string]any, 0, len(byCategory))
	for _, c := range byCategory {
		categoryOut = append(categoryOut, map[string]any{"id": c.ID, "name": c.Name, "slug": c.Slug, "clicks": c.Clicks})
	}

	return map[string]any{
		"total": total, "unique": unique, "days": days,
		"daily": dailyOut, "by_source": sourceOut, "top_products": topProducts,
		"by_channel": channelOut, "by_group": groupOut, "by_category": categoryOut,
		"catalog_total": catalogTotal, "catalog_new": catalogNew,
		"variants_total": variantsTotal, "messages_sent": messagesSent,
	}, nil
}

// Garante que AppConfig existe com id=1
func (s *SQLStore) ensureConfig() error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO appconfig (id) VALUES (1)`)
	return err
}

// Valida slug (só alfanumérico + hífen)
func ValidSlug(slug string) error {
	for _, c := range slug {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
			return fmt.Errorf("slug inválido: só letras minúsculas, dígitos e hífen")
		}
	}
	return nil
}

// ─────────────────── Affiliates ──────────────────────

// ListAffiliates retorna todos os afiliados, opcionalmente filtrados por source_id.
func (s *SQLStore) ListAffiliates(sourceID *string) ([]models.Affiliate, error) {
	var query string
	var args []interface{}

	if sourceID != nil && *sourceID != "" {
		query = `SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates WHERE source_id = $1 ORDER BY created_at DESC`
		args = []interface{}{*sourceID}
	} else {
		query = `SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates ORDER BY created_at DESC`
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var affiliates []models.Affiliate
	for rows.Next() {
		var a models.Affiliate
		if err := rows.Scan(&a.ID, &a.SourceID, &a.Name, &a.TrackingID, &a.Active, &a.CreatedAt); err != nil {
			return nil, err
		}
		affiliates = append(affiliates, a)
	}
	return affiliates, nil
}

// GetAffiliate retorna um afiliado por ID.
func (s *SQLStore) GetAffiliate(id int64) (models.Affiliate, error) {
	var a models.Affiliate
	err := s.db.QueryRow(
		`SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates WHERE id = $1`,
		id,
	).Scan(&a.ID, &a.SourceID, &a.Name, &a.TrackingID, &a.Active, &a.CreatedAt)
	return a, err
}

// CreateAffiliate cria um novo afiliado.
func (s *SQLStore) CreateAffiliate(a models.Affiliate) (int64, error) {
	active := 0
	if a.Active {
		active = 1
	}
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO affiliates (source_id, name, tracking_id, active) VALUES ($1, $2, $3, $4) RETURNING id`,
		a.SourceID, a.Name, a.TrackingID, active,
	).Scan(&id)
	return id, err
}

// UpdateAffiliate atualiza um afiliado existente.
func (s *SQLStore) UpdateAffiliate(a models.Affiliate) error {
	active := 0
	if a.Active {
		active = 1
	}
	_, err := s.db.Exec(
		`UPDATE affiliates SET source_id = $1, name = $2, tracking_id = $3, active = $4 WHERE id = $5`,
		a.SourceID, a.Name, a.TrackingID, active, a.ID,
	)
	return err
}

// DeleteAffiliate deleta um afiliado.
func (s *SQLStore) DeleteAffiliate(id int64) error {
	_, err := s.db.Exec(`DELETE FROM affiliates WHERE id = $1`, id)
	return err
}

// GetAffiliateBySource retorna o afiliado ativo para um source_id específico.
func (s *SQLStore) GetAffiliateBySource(sourceID string) (models.Affiliate, bool, error) {
	var a models.Affiliate
	err := s.db.QueryRow(
		`SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates WHERE source_id = $1 AND active = true LIMIT 1`,
		sourceID,
	).Scan(&a.ID, &a.SourceID, &a.Name, &a.TrackingID, &a.Active, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return a, false, nil
	}
	return a, err == nil, err
}

// ListAccountsForTarget retorna todas as contas associadas a um target, ordenadas por priority.
func (s *SQLStore) ListAccountsForTarget(targetID int64) ([]models.ChannelTargetAccount, error) {
	rows, err := s.db.Query(
		`SELECT id, target_id, account_id, role, priority, created_at FROM channel_target_accounts WHERE target_id = $1 ORDER BY priority ASC`,
		targetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []models.ChannelTargetAccount
	for rows.Next() {
		var cta models.ChannelTargetAccount
		if err := rows.Scan(&cta.ID, &cta.TargetID, &cta.AccountID, &cta.Role, &cta.Priority, &cta.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, cta)
	}
	return accounts, rows.Err()
}

// GetAccountsByTargetWithRole retorna contas com um role específico para um target.
func (s *SQLStore) GetAccountsByTargetWithRole(targetID int64, role string) ([]models.ChannelTargetAccount, error) {
	rows, err := s.db.Query(
		`SELECT id, target_id, account_id, role, priority, created_at FROM channel_target_accounts WHERE target_id = $1 AND role = $2 ORDER BY priority ASC`,
		targetID, role,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []models.ChannelTargetAccount
	for rows.Next() {
		var cta models.ChannelTargetAccount
		if err := rows.Scan(&cta.ID, &cta.TargetID, &cta.AccountID, &cta.Role, &cta.Priority, &cta.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, cta)
	}
	return accounts, rows.Err()
}

// ---------------------------------------------------------------------------
// RedesignGroups
// ---------------------------------------------------------------------------

func (s *SQLStore) ListRedesignGroups(channelID int64, platform, status string) ([]models.RedesignGroup, error) {
	q := `SELECT id, short_id, channel_id, wa_account_id, tg_account_id, name, platform,
	             jid, invite_link, status, member_count, overrides, created_at, last_message_at,
	             COALESCE(archived, false) AS archived, last_error, last_error_at
	      FROM groups WHERE ($1 = 0 OR channel_id = $1)
	        AND ($2 = '' OR platform = $2)
	        AND ($3 = '' OR status = $3)
	      ORDER BY created_at DESC`
	var out []models.RedesignGroup
	return out, s.db.Select(&out, q, channelID, platform, status)
}

func (s *SQLStore) GetRedesignGroup(id int64) (models.RedesignGroup, error) {
	var g models.RedesignGroup
	return g, s.db.Get(&g,
		`SELECT id, short_id, channel_id, wa_account_id, tg_account_id, name, platform,
		        jid, invite_link, status, member_count, overrides, created_at, last_message_at,
		        COALESCE(archived, false) AS archived, last_error, last_error_at
		 FROM groups WHERE id = $1`, id)
}

func (s *SQLStore) CreateRedesignGroup(g models.RedesignGroup) (int64, error) {
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO groups (channel_id, wa_account_id, tg_account_id, name, platform, jid, invite_link, status, overrides)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		g.ChannelID, g.WAAccountID, g.TGAccountID, g.Name, g.Platform,
		g.JID, g.InviteLink, g.Status, g.Overrides,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) CountGroupsWithSameJID(platform, jid string) (int, error) {
	var n int
	err := s.db.Get(&n, `
		SELECT COUNT(*) FROM groups
		WHERE platform = $1 AND jid = $2 AND COALESCE(archived, false) = false`,
		platform, jid)
	return n, err
}

func (s *SQLStore) FindConflictingRedesignGroup(candidate models.RedesignGroup, excludeID int64) (*models.RedesignGroup, error) {
	if !candidate.JID.Valid {
		return nil, nil
	}
	jid := strings.TrimSpace(candidate.JID.String)
	if jid == "" {
		return nil, nil
	}
	platform := strings.TrimSpace(candidate.Platform)
	if platform == "" {
		return nil, nil
	}

	const base = `SELECT id, short_id, channel_id, wa_account_id, tg_account_id, name, platform,
		jid, invite_link, status, member_count, overrides, created_at, last_message_at,
		COALESCE(archived, false) AS archived, last_error, last_error_at
		FROM groups
		WHERE id <> $1 AND COALESCE(archived, false) = false
		AND platform = $2
		AND trim(jid) <> ''
		AND lower(trim(jid)) = lower(trim($3))`

	var dup models.RedesignGroup
	var err error

	switch {
	case candidate.ChannelID.Valid:
		err = s.db.Get(&dup, base+` AND channel_id = $4 LIMIT 1`, excludeID, platform, jid, candidate.ChannelID.Int64)
	case candidate.WAAccountID.Valid:
		err = s.db.Get(&dup, base+` AND channel_id IS NULL AND wa_account_id = $4 LIMIT 1`, excludeID, platform, jid, candidate.WAAccountID.Int64)
	case candidate.TGAccountID.Valid:
		err = s.db.Get(&dup, base+` AND channel_id IS NULL AND tg_account_id = $4 LIMIT 1`, excludeID, platform, jid, candidate.TGAccountID.Int64)
	default:
		return nil, nil
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &dup, nil
}

func (s *SQLStore) SoftWipeOperationalData() error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmts := []string{
		`UPDATE groups SET archived = true WHERE COALESCE(archived, false) = false`,
		`UPDATE channel SET active = false WHERE active = true`,
		`UPDATE catalogproduct SET inactive = true WHERE COALESCE(inactive, false) = false`,
		`UPDATE group_spies SET active = false, deleted_at = NOW() WHERE deleted_at IS NULL`,
	}
	for _, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLStore) ReseedTaxonomySeedInserts() error {
	stmts := splitTaxonomySeedStatements(taxonomySeedDataSQL)
	if len(stmts) == 0 {
		return fmt.Errorf("seed embutido vazio ou sem INSERT")
	}
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return fmt.Errorf("stmt %d/%d: %w", i+1, len(stmts), err)
		}
	}
	return tx.Commit()
}

func (s *SQLStore) ReseedCrawlerChannelSeedInserts() error {
	stmts := splitTaxonomySeedStatements(crawlerChannelSeedSQL)
	if len(stmts) == 0 {
		return fmt.Errorf("crawler/channel seed embutido vazio ou sem INSERT")
	}
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return fmt.Errorf("crawler/channel stmt %d/%d: %w", i+1, len(stmts), err)
		}
	}
	return tx.Commit()
}

func (s *SQLStore) UpdateRedesignGroup(g models.RedesignGroup) error {
	_, err := s.db.NamedExec(`
		UPDATE groups SET name=:name, platform=:platform, jid=:jid,
			invite_link=:invite_link, status=:status, member_count=:member_count,
			overrides=:overrides, wa_account_id=:wa_account_id, tg_account_id=:tg_account_id,
			channel_id=:channel_id,
			archived=:archived, last_error=:last_error, last_error_at=:last_error_at
		WHERE id=:id`, g)
	return err
}

func (s *SQLStore) DeleteRedesignGroup(id int64) error {
	_, err := s.db.Exec(`DELETE FROM groups WHERE id = $1`, id)
	return err
}

// ---------------------------------------------------------------------------
// AffiliatePrograms (ReDesign)
// ---------------------------------------------------------------------------

func (s *SQLStore) ListAffiliatePrograms(active *bool) ([]models.AffiliateProgram, error) {
	var out []models.AffiliateProgram
	if active == nil {
		return out, s.db.Select(&out,
			`SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at
			 FROM affiliate_programs ORDER BY name`)
	}
	return out, s.db.Select(&out,
		`SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at
		 FROM affiliate_programs WHERE active = $1 ORDER BY name`, *active)
}

func (s *SQLStore) GetAffiliateProgram(id int64) (models.AffiliateProgram, error) {
	var p models.AffiliateProgram
	return p, s.db.Get(&p,
		`SELECT id, short_id, name, marketplace, active, credentials, rules, postback, created_at
		 FROM affiliate_programs WHERE id = $1`, id)
}

func (s *SQLStore) CreateAffiliateProgram(p models.AffiliateProgram) (int64, error) {
	if p.Credentials == nil {
		p.Credentials = []byte("{}")
	}
	if p.Rules == nil {
		p.Rules = []byte("{}")
	}
	if p.Postback == nil {
		p.Postback = []byte("{}")
	}
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO affiliate_programs (name, marketplace, credentials, active, rules, postback)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		p.Name, p.Marketplace, p.Credentials, p.Active, p.Rules, p.Postback,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateAffiliateProgram(p models.AffiliateProgram) error {
	if p.Credentials == nil {
		p.Credentials = []byte("{}")
	}
	_, err := s.db.Exec(
		`UPDATE affiliate_programs SET name=$1, active=$2, credentials=$3, rules=$4, postback=$5 WHERE id=$6`,
		p.Name, p.Active, p.Credentials, p.Rules, p.Postback, p.ID)
	return err
}

func (s *SQLStore) DeleteAffiliateProgram(id int64) error {
	_, err := s.db.Exec(`DELETE FROM affiliate_programs WHERE id = $1`, id)
	return err
}

func (s *SQLStore) ListAffiliateProgramsByMarketplace(marketplace string) ([]models.AffiliateProgram, error) {
	var out []models.AffiliateProgram
	return out, s.db.Select(&out,
		`SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at
		 FROM affiliate_programs WHERE marketplace = $1 AND active = true ORDER BY id`, marketplace)
}

// ---------------------------------------------------------------------------
// PublicLinks
// ---------------------------------------------------------------------------

func (s *SQLStore) CreatePublicLink(l models.PublicLink) (int64, error) {
	if l.FallbackChain == nil {
		l.FallbackChain = []byte("[]")
	}
	if l.RedirectStrategy == "" {
		l.RedirectStrategy = "first_active"
	}
	var id int64
	return id, s.db.QueryRow(`
		INSERT INTO public_links (slug, channel_id, fallback_chain, redirect_strategy)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		l.Slug, l.ChannelID, l.FallbackChain, l.RedirectStrategy,
	).Scan(&id)
}

func (s *SQLStore) GetPublicLink(id int64) (models.PublicLink, error) {
	var l models.PublicLink
	return l, s.db.Get(&l,
		`SELECT id, slug, channel_id, fallback_chain, redirect_strategy, round_robin_idx, active, clicks_30d, created_at
		 FROM public_links WHERE id = $1`, id)
}

func (s *SQLStore) GetPublicLinkBySlug(slug string) (models.PublicLink, error) {
	var l models.PublicLink
	return l, s.db.Get(&l,
		`SELECT id, slug, channel_id, fallback_chain, redirect_strategy, round_robin_idx, active, clicks_30d, created_at
		 FROM public_links WHERE slug = $1 AND active = true`, slug)
}

func (s *SQLStore) ListPublicLinks() ([]models.PublicLink, error) {
	var out []models.PublicLink
	return out, s.db.Select(&out,
		`SELECT id, slug, channel_id, fallback_chain, redirect_strategy, round_robin_idx, active, clicks_30d, created_at
		 FROM public_links ORDER BY created_at DESC`)
}

func (s *SQLStore) UpdatePublicLink(l models.PublicLink) error {
	_, err := s.db.Exec(`
		UPDATE public_links SET slug=$1, fallback_chain=$2, redirect_strategy=$3, active=$4 WHERE id=$5`,
		l.Slug, l.FallbackChain, l.RedirectStrategy, l.Active, l.ID)
	return err
}

func (s *SQLStore) DeletePublicLink(id int64) error {
	_, err := s.db.Exec(`DELETE FROM public_links WHERE id = $1`, id)
	return err
}

func (s *SQLStore) IncrementRoundRobinIdx(id int64, newIdx int) error {
	_, err := s.db.Exec(`UPDATE public_links SET round_robin_idx = $1 WHERE id = $2`, newIdx, id)
	return err
}

// IncrementPublicLinkClicks aumenta clicks_30d em 1 para o link público dado.
// Usado pelo resolver /g/{slug} para fechar o loop de atribuição.
// Nota: clicks_30d hoje é cumulativo na coluna; o "30d" é semântico — o expurgo
// fica para um job de cleanup periódico, fora do hot path do resolver.
func (s *SQLStore) IncrementPublicLinkClicks(id int64) error {
	_, err := s.db.Exec(`UPDATE public_links SET clicks_30d = clicks_30d + 1 WHERE id = $1`, id)
	return err
}

// PurgeOldLLMMetrics apaga registros mais antigos que `days` dias da tabela
// llm_metrics. Retorna quantas linhas foram removidas. Idealmente chamado
// por um job diário; ver docs/llm-metrics-retention.md.
func (s *SQLStore) PurgeOldLLMMetrics(days int) (int64, error) {
	if days <= 0 {
		days = 90
	}
	res, err := s.db.Exec(
		`DELETE FROM llm_metrics WHERE created_at < now() - ($1 || ' days')::interval`,
		days,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------

func (s *SQLStore) CreateDispatch(d models.Dispatch, targets []models.DispatchTarget) (int64, error) {
	tx, err := s.db.Beginx()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	if d.Message == nil {
		d.Message = []byte("{}")
	}

	var id int64
	status := d.Status
	if status == "" {
		status = "queued"
	}
	var scheduledFor interface{}
	if d.ScheduledFor.Valid {
		scheduledFor = d.ScheduledFor.Time
	}
	err = tx.QueryRow(`
		INSERT INTO dispatches (product_id, composed_by, message, affiliate_link, status, scheduled_for)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		d.ProductID, d.ComposedBy, d.Message, d.AffiliateLink, status, scheduledFor,
	).Scan(&id)
	if err != nil {
		return 0, err
	}

	for _, t := range targets {
		_, err = tx.Exec(`
			INSERT INTO dispatch_targets (dispatch_id, group_id, wa_account_id, tg_account_id, status)
			VALUES ($1, $2, $3, $4, 'pending')`,
			id, t.GroupID, t.WAAccountID, t.TGAccountID)
		if err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}

func (s *SQLStore) GetDispatch(id int64) (models.Dispatch, error) {
	var d models.Dispatch
	return d, s.db.Get(&d,
		`SELECT id, short_id, product_id, composed_by, message, affiliate_link,
		        scheduled_for, created_by, status, created_at
		 FROM dispatches WHERE id = $1`, id)
}

func (s *SQLStore) ListDispatches(status string, limit, offset int) ([]models.Dispatch, error) {
	if limit == 0 {
		limit = 50
	}
	var out []models.Dispatch
	return out, s.db.Select(&out,
		`SELECT id, short_id, product_id, composed_by, message, affiliate_link,
		        scheduled_for, created_by, status, created_at
		 FROM dispatches WHERE ($1 = '' OR status = $1)
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, status, limit, offset)
}

func (s *SQLStore) ListDispatchTargets(dispatchID int64) ([]models.DispatchTarget, error) {
	var out []models.DispatchTarget
	return out, s.db.Select(&out,
		`SELECT id, dispatch_id, group_id, wa_account_id, tg_account_id, status,
		        attempted_at, delivered_at, error_reason, click_count, conversions, revenue
		 FROM dispatch_targets WHERE dispatch_id = $1`, dispatchID)
}

func (s *SQLStore) UpdateDispatchTargetStatus(id int64, status, errorReason string) error {
	_, err := s.db.Exec(`
		UPDATE dispatch_targets
		SET status = $1,
		    error_reason = NULLIF($2, ''),
		    attempted_at = CASE WHEN $1 = 'sending' THEN now() ELSE attempted_at END,
		    delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END
		WHERE id = $3`, status, errorReason, id)
	return err
}

func (s *SQLStore) UpdateDispatchStatus(id int64, status string) error {
	_, err := s.db.Exec(`UPDATE dispatches SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (s *SQLStore) CancelDispatch(id int64) error {
	_, err := s.db.Exec(`
		UPDATE dispatches SET status = 'failed'
		WHERE id = $1 AND status IN ('draft', 'queued')`, id)
	return err
}

// CountRecentDeliveriesByGroup retorna quantos dispatches foram entregues por grupo
// nos últimos `minutes`. Usado pelo dispatch worker para aplicar rate limit por grupo.
func (s *SQLStore) CountRecentDeliveriesByGroup(minutes int) ([]GroupDeliveryCount, error) {
	if minutes <= 0 {
		minutes = 60
	}
	var out []GroupDeliveryCount
	err := s.db.Select(&out, `
		SELECT group_id, COUNT(*) AS count
		FROM dispatch_targets
		WHERE status = 'delivered'
		  AND COALESCE(delivered_at, updated_at, created_at) > now() - ($1 || ' minutes')::interval
		GROUP BY group_id`, minutes)
	return out, err
}

// CountPendingTargetsByGroup retorna quantos targets pending+queued+sending estão pendentes por grupo.
// Usado pelo auto-match para backpressure (não criar novos dispatches se grupo já tem fila grande).
func (s *SQLStore) CountPendingTargetsByGroup() ([]GroupDeliveryCount, error) {
	var out []GroupDeliveryCount
	err := s.db.Select(&out, `
		SELECT group_id, COUNT(*) AS count
		FROM dispatch_targets
		WHERE status IN ('pending', 'sending')
		GROUP BY group_id`)
	return out, err
}

func (s *SQLStore) ListPendingDispatchTargets(limit int) ([]models.DispatchTarget, error) {
	if limit <= 0 {
		limit = 20
	}
	var out []models.DispatchTarget
	err := s.db.Select(&out, `
		SELECT dt.* FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		WHERE dt.status = 'pending' AND d.status IN ('queued', 'sending')
		  AND (d.scheduled_for IS NULL OR d.scheduled_for <= now())
		ORDER BY dt.id ASC
		LIMIT $1`, limit)
	return out, err
}

func (s *SQLStore) PromotePendingApprovalToQueued() (int64, error) {
	res, err := s.db.Exec(`
		UPDATE dispatches SET status = 'queued'
		WHERE status = 'pending_approval'
		  AND EXISTS (SELECT 1 FROM appconfig WHERE id = 1 AND full_auto_mode = true)`)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLStore) AllDispatchTargetsFinished(dispatchID int64) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM dispatch_targets WHERE dispatch_id = $1 AND status IN ('pending','sending')`, dispatchID)
	return count == 0, err
}

func (s *SQLStore) HasDeliveredTarget(dispatchID int64) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM dispatch_targets WHERE dispatch_id = $1 AND status = 'delivered'`, dispatchID)
	return count > 0, err
}

func (s *SQLStore) DispatchIDsWithDelivered(dispatchIDs []int64) map[int64]bool {
	out := make(map[int64]bool)
	if len(dispatchIDs) == 0 {
		return out
	}
	var rows []int64
	err := s.db.Select(&rows,
		`SELECT DISTINCT dispatch_id FROM dispatch_targets
		 WHERE dispatch_id = ANY($1) AND status = 'delivered'`,
		pq.Array(dispatchIDs))
	if err != nil {
		return out
	}
	for _, id := range rows {
		out[id] = true
	}
	return out
}

func (s *SQLStore) ListChannelDispatchHistory(channelID int64, limit int) ([]models.ChannelHistoryEntry, error) {
	if limit == 0 {
		limit = 50
	}
	var out []models.ChannelHistoryEntry
	err := s.db.Select(&out, `
		SELECT dt.dispatch_id, g.id as group_id, g.name as group_name,
		       dt.status, dt.delivered_at,
		       COALESCE((d.message->>'text')::text, '') as message_text,
		       d.created_at,
		       aml.score
		FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		JOIN groups g ON g.id = dt.group_id
		LEFT JOIN auto_match_logs aml ON aml.dispatch_id = d.id
		WHERE g.channel_id = $1
		ORDER BY d.created_at DESC
		LIMIT $2`, channelID, limit)
	return out, err
}

// ---------------------------------------------------------------------------
// Clusters
// ---------------------------------------------------------------------------

func (s *SQLStore) ListClusters() ([]models.Cluster, error) {
	var out []models.Cluster
	return out, s.db.Select(&out,
		`SELECT id, label, COALESCE(description,'') as description,
		        member_channels, metrics, top_categories, top_brands, computed_at
		 FROM clusters ORDER BY computed_at DESC`)
}

func (s *SQLStore) GetCluster(id int64) (models.Cluster, error) {
	var c models.Cluster
	return c, s.db.Get(&c,
		`SELECT id, label, COALESCE(description,'') as description,
		        member_channels, metrics, top_categories, top_brands, computed_at
		 FROM clusters WHERE id = $1`, id)
}

func (s *SQLStore) UpsertClusters(clusters []models.Cluster) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.Exec(`DELETE FROM clusters`); err != nil {
		return err
	}
	for _, c := range clusters {
		// Colunas PostgreSQL são BIGINT[] / TEXT[] — não aceitar literal JSON "[1,2]" (malformed array).
		var memberIDs []int64
		if len(c.MemberChannels) > 0 {
			_ = json.Unmarshal(c.MemberChannels, &memberIDs)
		}
		var cats, brands []string
		if len(c.TopCategories) > 0 {
			_ = json.Unmarshal(c.TopCategories, &cats)
		}
		if len(c.TopBrands) > 0 {
			_ = json.Unmarshal(c.TopBrands, &brands)
		}
		if _, err := tx.Exec(`
			INSERT INTO clusters (label, description, member_channels, metrics, top_categories, top_brands)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			c.Label, c.Description, pq.Array(memberIDs), c.Metrics, pq.Array(cats), pq.Array(brands)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------------------------------------------------------------------------
// GroupSpies
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroupSpies(platform string, activeOnly bool) ([]models.GroupSpy, error) {
	q := `SELECT id, short_id, group_name, platform, invite_link, reader_wa_id, reader_tg_id,
	             remote_group_id, active, joined_at, stats
	      FROM group_spies
	      WHERE deleted_at IS NULL
	        AND ($1 = '' OR platform = $1)
	        AND ($2 = false OR active = true)
	      ORDER BY joined_at DESC`
	var out []models.GroupSpy
	return out, s.db.Select(&out, q, platform, activeOnly)
}

func (s *SQLStore) GetGroupSpy(id int64) (models.GroupSpy, error) {
	var g models.GroupSpy
	return g, s.db.Get(&g,
		`SELECT id, short_id, group_name, platform, invite_link, reader_wa_id, reader_tg_id,
		        remote_group_id, active, joined_at, stats
		 FROM group_spies WHERE id = $1 AND deleted_at IS NULL`, id)
}

func (s *SQLStore) CreateGroupSpy(g models.GroupSpy) (int64, error) {
	if g.Stats == nil {
		g.Stats = []byte("{}")
	}
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO group_spies (group_name, platform, invite_link, reader_wa_id, reader_tg_id, active, stats)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		g.GroupName, g.Platform, g.InviteLink, g.ReaderWAID, g.ReaderTGID, true, g.Stats,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) SoftDeleteGroupSpy(id int64) error {
	_, err := s.db.Exec(`UPDATE group_spies SET active = false, deleted_at = now() WHERE id = $1`, id)
	return err
}

func (s *SQLStore) UpdateGroupSpyReader(id int64, readerWAID, readerTGID models.NullInt64) error {
	_, err := s.db.Exec(
		`UPDATE group_spies SET reader_wa_id = $1, reader_tg_id = $2 WHERE id = $3 AND deleted_at IS NULL`,
		readerWAID, readerTGID, id,
	)
	return err
}

func (s *SQLStore) ListSpyMessages(spyID int64, limit int) ([]models.SpyMessage, error) {
	if limit <= 0 {
		limit = 50
	}
	var out []models.SpyMessage
	err := s.db.Select(&out,
		`SELECT id, spy_id, sender, text, media_url, collected_at
		 FROM spy_messages WHERE spy_id = $1
		 ORDER BY collected_at DESC LIMIT $2`, spyID, limit)
	if out == nil {
		out = []models.SpyMessage{}
	}
	return out, err
}

func (s *SQLStore) CreateSpyMessage(m models.SpyMessage) error {
	_, err := s.db.Exec(
		`INSERT INTO spy_messages (spy_id, sender, text, media_url) VALUES ($1, $2, $3, $4)`,
		m.SpyID, m.Sender, m.Text, m.MediaURL)
	return err
}

// ---------------------------------------------------------------------------
// GroupAdmins (migration 0085)
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroupAdmins(groupID int64) ([]models.GroupAdmin, error) {
	var out []models.GroupAdmin
	err := s.db.Select(&out,
		`SELECT id, group_id, account_type, account_id, added_at
		 FROM group_admins WHERE group_id = $1 ORDER BY added_at ASC`, groupID)
	if out == nil {
		out = []models.GroupAdmin{}
	}
	return out, err
}

func (s *SQLStore) AddGroupAdmin(a models.GroupAdmin) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO group_admins (group_id, account_type, account_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (group_id, account_type, account_id) DO UPDATE SET added_at = now()
		 RETURNING id`,
		a.GroupID, a.AccountType, a.AccountID).Scan(&id)
	return id, err
}

func (s *SQLStore) DeleteGroupAdmin(id int64) error {
	_, err := s.db.Exec(`DELETE FROM group_admins WHERE id = $1`, id)
	return err
}

func (s *SQLStore) CountGroupAdmins(groupID int64) (int, error) {
	var count int
	err := s.db.Get(&count, `SELECT COUNT(*) FROM group_admins WHERE group_id = $1`, groupID)
	return count, err
}

// SetGroupArchived alterna archived e opcionalmente seta last_error.
func (s *SQLStore) SetGroupArchived(id int64, archived bool, lastError *string) error {
	if lastError != nil {
		_, err := s.db.Exec(
			`UPDATE groups SET archived = $1, last_error = $2, last_error_at = now() WHERE id = $3`,
			archived, *lastError, id)
		return err
	}
	_, err := s.db.Exec(`UPDATE groups SET archived = $1 WHERE id = $2`, archived, id)
	return err
}

// ---------------------------------------------------------------------------
// AffiliateConversions (migration 0086)
// ---------------------------------------------------------------------------

func (s *SQLStore) InsertAffiliateConversion(c models.AffiliateConversion) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO affiliate_conversions (program_id, click_id, external_order_id, revenue, status)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		c.ProgramID, c.ClickID, c.ExternalOrderID, c.Revenue, c.Status).Scan(&id)
	return id, err
}

// ---------------------------------------------------------------------------
// Product failures (purge 404)
// ---------------------------------------------------------------------------

func (s *SQLStore) IncrementProductFailures(id int64) error {
	_, err := s.db.Exec(`
		UPDATE catalogproduct
		SET consecutive_failures = consecutive_failures + 1,
		    inactive = (consecutive_failures + 1 >= 10)
		WHERE id = $1`, id)
	return err
}

func (s *SQLStore) ResetProductFailures(id int64) error {
	_, err := s.db.Exec(`
		UPDATE catalogproduct
		SET consecutive_failures = 0,
		    inactive = FALSE
		WHERE id = $1 AND (consecutive_failures > 0 OR inactive = TRUE)`, id)
	return err
}

// ListTaxonomy retorna entradas da taxonomia (categorias ou marcas).
// Se type for vazio, retorna ambos.
func (s *SQLStore) ListTaxonomy(taxType string) ([]models.Taxonomy, error) {
	var out []models.Taxonomy
	if taxType == "" {
		err := s.db.Select(&out, `
			SELECT id, type, name, slug, keywords, parent_id, detect_count,
			       last_detected_at, active, status, source, sample_text, created_at
			FROM taxonomy WHERE status = 'approved' ORDER BY type, name`)
		return out, err
	}
	err := s.db.Select(&out, `
		SELECT id, type, name, slug, keywords, parent_id, detect_count,
		       last_detected_at, active, status, source, sample_text, created_at
		FROM taxonomy WHERE type = $1 AND status = 'approved' AND active = true ORDER BY name`, taxType)
	return out, err
}

// ListTaxonomyWithParent retorna entradas da taxonomia filtradas por type e/ou parent_id.
// parentID == nil → sem filtro por parent; parentID com valor específico (inclusive 0) → filtro aplicado.
func (s *SQLStore) ListTaxonomyWithParent(taxType string, parentID *int64) ([]models.Taxonomy, error) {
	var out []models.Taxonomy

	query := `
		SELECT id, type, name, slug, keywords, parent_id, detect_count,
		       last_detected_at, active, status, source, sample_text, created_at
		FROM taxonomy WHERE status = 'approved' AND active = true`

	var args []interface{}

	if taxType != "" {
		query += ` AND type = $1`
		args = append(args, taxType)
	}

	if parentID != nil {
		if len(args) == 0 {
			query += ` AND parent_id = $1`
		} else {
			query += ` AND parent_id = $2`
		}
		args = append(args, *parentID)
	}

	query += ` ORDER BY name`

	var err error
	if len(args) == 0 {
		err = s.db.Select(&out, query)
	} else if len(args) == 1 {
		err = s.db.Select(&out, query, args[0])
	} else {
		err = s.db.Select(&out, query, args[0], args[1])
	}

	return out, err
}

// IncrementTaxonomyDetect aumenta o contador de detecção e atualiza last_detected_at.
// Usado pelo crawler/categorizador para tunning das keywords.
func (s *SQLStore) IncrementTaxonomyDetect(id int64) error {
	_, err := s.db.Exec(`
		UPDATE taxonomy SET detect_count = detect_count + 1, last_detected_at = now()
		WHERE id = $1`, id)
	return err
}

// CreateTaxonomy insere nova entrada (categoria/marca).
func (s *SQLStore) CreateTaxonomy(t models.Taxonomy) (int64, error) {
	if t.Status == "" {
		t.Status = "approved"
	}
	if t.Source == "" {
		t.Source = "manual"
	}
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source, sample_text)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (type, slug) DO UPDATE SET
			name = EXCLUDED.name,
			keywords = EXCLUDED.keywords,
			active = EXCLUDED.active
		RETURNING id`,
		t.Type, t.Name, t.Slug, t.Keywords, t.ParentID, t.Active, t.Status, t.Source, t.SampleText,
	).Scan(&id)
	return id, err
}

// UpdateTaxonomy atualiza nome, keywords e active de uma entrada.
func (s *SQLStore) UpdateTaxonomy(t models.Taxonomy) error {
	_, err := s.db.Exec(`
		UPDATE taxonomy
		SET name = $1, keywords = $2, active = $3
		WHERE id = $4`,
		t.Name, t.Keywords, t.Active, t.ID)
	return err
}

// DeleteTaxonomy remove uma entrada da taxonomia.
func (s *SQLStore) DeleteTaxonomy(id int64) error {
	_, err := s.db.Exec(`DELETE FROM taxonomy WHERE id = $1`, id)
	return err
}

// SetTaxonomyStatus aprova ou rejeita uma entrada pendente.
// status: 'approved' | 'rejected'
func (s *SQLStore) SetTaxonomyStatus(id int64, status string) error {
	_, err := s.db.Exec(`
		UPDATE taxonomy SET status = $1, active = ($1 = 'approved') WHERE id = $2`,
		status, id)
	return err
}

// ListPendingTaxonomy retorna entradas com status='pending' (descobertas pelo crawler/LLM).
func (s *SQLStore) ListPendingTaxonomy() ([]models.Taxonomy, error) {
	var out []models.Taxonomy
	err := s.db.Select(&out, `
		SELECT id, type, name, slug, keywords, parent_id, detect_count,
		       last_detected_at, active, status, source, sample_text, created_at
		FROM taxonomy WHERE status = 'pending' ORDER BY detect_count DESC, created_at DESC`)
	return out, err
}

// DetectAndUpsertTaxonomy é o ponto de integração para crawler/categorizador.
// Recebe um texto (ex: nome de produto) e:
//  1. Busca matches contra keywords das taxonomias aprovadas → incrementa detect_count
//  2. Retorna IDs das taxonomias matchadas para uso em score
//
// Não cria pendentes — isso fica para um job LLM separado.
func (s *SQLStore) DetectAndUpsertTaxonomy(text string) ([]int64, error) {
	if text == "" {
		return nil, nil
	}
	var ids []int64
	// Match normalizado: lower + unaccent dos dois lados.
	// "Fogão" (keyword) bate com "FOGAO" (título), evita duplicatas na taxonomia.
	// Word-boundary match via regex PostgreSQL (\m = início de palavra, \M = fim de palavra).
	// "acer" NÃO bate em "racer" porque 'r' antes de 'acer' não é início de palavra.
	err := s.db.Select(&ids, `
		WITH matched AS (
			SELECT id FROM taxonomy
			WHERE status = 'approved' AND active = TRUE
			  AND EXISTS (
			    SELECT 1 FROM unnest(keywords) AS kw
			    WHERE lower(unaccent($1)) ~ ('\m' || lower(unaccent(kw)) || '\M')
			  )
		)
		UPDATE taxonomy SET detect_count = detect_count + 1, last_detected_at = now()
		WHERE id IN (SELECT id FROM matched)
		RETURNING id`, text)
	return ids, err
}

// GetTaxonomy retorna uma entrada de taxonomia por ID.
func (s *SQLStore) GetTaxonomy(id int64) (*models.Taxonomy, error) {
	var t models.Taxonomy
	err := s.db.Get(&t, `SELECT * FROM taxonomy WHERE id = $1`, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

// GetTaxonomyByIDs retorna as entradas de taxonomia para os IDs fornecidos.
func (s *SQLStore) GetTaxonomyByIDs(ids []int64) ([]models.Taxonomy, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var out []models.Taxonomy
	q, args, err := sqlx.In(`SELECT * FROM taxonomy WHERE id IN (?)`, ids)
	if err != nil {
		return nil, err
	}
	q = s.db.Rebind(q)
	err = s.db.Select(&out, q, args...)
	return out, err
}

// SuggestTaxonomyCandidate cria entrada pending a partir de texto não-categorizado.
// Usado pelo job LLM quando produto não bate com nenhuma taxonomia aprovada.
func (s *SQLStore) SuggestTaxonomyCandidate(taxType, name string, keywords []string, sampleText, source string) (int64, error) {
	slug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "-"))
	t := models.Taxonomy{
		Type:       taxType,
		Name:       name,
		Slug:       slug,
		Keywords:   pq.StringArray(keywords),
		Active:     false,
		Status:     "pending",
		Source:     source,
		SampleText: models.NullString{NullString: sql.NullString{String: sampleText, Valid: sampleText != ""}},
	}
	return s.CreateTaxonomy(t)
}

// sourceAliases mapeia nomes de display para todos os valores armazenados pelo crawler.
func sourceAliases(s string) []string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "amazon":
		return []string{"amazon", "amz"}
	case "mercadolivre":
		return []string{"mercadolivre", "ml", "mercado_livre", "mercado livre"}
	case "magalu":
		return []string{"magalu", "magazine_luiza", "magazineluiza"}
	case "shopee":
		return []string{"shopee"}
	case "aliexpress":
		return []string{"aliexpress", "ali"}
	case "kabum":
		return []string{"kabum"}
	case "americanas":
		return []string{"americanas", "americanas.com"}
	case "casasbahia":
		return []string{"casasbahia", "casas_bahia", "casas bahia"}
	default:
		return []string{s}
	}
}

// FilterCatalogProducts executa busca com filtros combinados.
func (s *SQLStore) FilterCatalogProducts(f CatalogFilters) ([]models.CatalogProduct, int64, error) {
	var args []any
	idx := 1

	base := `FROM catalogproduct WHERE 1=1`

	if !f.IncludeInactive {
		base += ` AND inactive = FALSE`
	}
	if f.Search != "" {
		pattern := "%" + f.Search + "%"
		base += fmt.Sprintf(` AND (canonical_name ILIKE $%d OR tags::text ILIKE $%d OR brand ILIKE $%d)`, idx, idx, idx)
		args = append(args, pattern)
		idx++
	}
	if f.Source != "" {
		aliases := sourceAliases(f.Source)
		placeholders := make([]string, len(aliases))
		for i, a := range aliases {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, a)
			idx++
		}
		base += ` AND lowest_price_source IN (` + strings.Join(placeholders, ",") + `)`
	}
	if f.Tag != "" {
		tagJSON, _ := json.Marshal([]string{f.Tag})
		base += fmt.Sprintf(` AND tags @> $%d::jsonb`, idx)
		args = append(args, string(tagJSON))
		idx++
	}
	if f.Brand != "" {
		base += fmt.Sprintf(` AND brand ILIKE $%d`, idx)
		args = append(args, "%"+f.Brand+"%")
		idx++
	}
	if f.PrimaryCategory != "" {
		base += fmt.Sprintf(` AND EXISTS (
			SELECT 1 FROM catalogproduct_taxonomy cpt
			INNER JOIN taxonomy t ON t.id = cpt.taxonomy_id
			WHERE cpt.product_id = catalogproduct.id AND cpt.role = 'primary_category' AND t.name = $%d)`, idx)
		args = append(args, f.PrimaryCategory)
		idx++
	}
	if f.Subcategory != "" {
		base += fmt.Sprintf(` AND EXISTS (
			SELECT 1 FROM catalogproduct_taxonomy cpt
			INNER JOIN taxonomy t ON t.id = cpt.taxonomy_id
			WHERE cpt.product_id = catalogproduct.id AND cpt.role = 'subcategory' AND t.name = $%d)`, idx)
		args = append(args, f.Subcategory)
		idx++
	}
	switch f.Status {
	case "novos":
		base += ` AND curation_status = 'pending'`
	case "curados":
		base += ` AND curation_status IN ('curated', 'auto')`
	}

	// total
	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := s.db.Get(&total, `SELECT COUNT(*) `+base, countArgs...); err != nil {
		return nil, 0, err
	}

	// items
	query := `SELECT * ` + base + ` ORDER BY updated_at DESC`
	query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, idx, idx+1)
	args = append(args, f.Limit, f.Offset)

	var out []models.CatalogProduct
	if err := s.db.Select(&out, query, args...); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// ListPendingCurationProducts retorna produtos com curation_status='pending' (aguardando categorização).
func (s *SQLStore) ListPendingCurationProducts(limit int) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out, `
		SELECT * FROM catalogproduct
		WHERE curation_status = 'pending'
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	return out, err
}

// ListTaxonomyPatterns retorna padrões de taxonomy filtrados por IDs e kinds.
func (s *SQLStore) ListTaxonomyPatterns(taxonomyIDs []int64, kinds []string) ([]models.TaxonomyPattern, error) {
	var out []models.TaxonomyPattern
	query := `
		SELECT id, taxonomy_id, kind, value, weight, locale, source, active, created_at, updated_at
		FROM taxonomy_pattern
		WHERE 1=1`
	args := []interface{}{}

	if len(taxonomyIDs) > 0 {
		query += ` AND taxonomy_id = ANY($` + strconv.Itoa(len(args)+1) + `)`
		args = append(args, pq.Array(taxonomyIDs))
	}

	if len(kinds) > 0 {
		query += ` AND kind = ANY($` + strconv.Itoa(len(args)+1) + `)`
		args = append(args, pq.Array(kinds))
	}

	query += ` ORDER BY created_at DESC`

	err := s.db.Select(&out, query, args...)
	return out, err
}

// ListAllActivePatterns retorna todos os padrões ativos de taxonomy.
func (s *SQLStore) ListAllActivePatterns() ([]models.TaxonomyPattern, error) {
	var out []models.TaxonomyPattern
	err := s.db.Select(&out, `
		SELECT id, taxonomy_id, kind, value, weight, locale, source, active, created_at, updated_at
		FROM taxonomy_pattern
		WHERE active = true
		ORDER BY created_at DESC`)
	return out, err
}

// MaxTaxonomyPatternUpdatedAt retorna o timestamp mais recente de atualização em taxonomy_pattern.
func (s *SQLStore) MaxTaxonomyPatternUpdatedAt() (time.Time, error) {
	var maxTime *time.Time
	err := s.db.Get(&maxTime, `SELECT MAX(updated_at) FROM taxonomy_pattern`)
	if err != nil {
		return time.Time{}, err
	}
	if maxTime == nil {
		return time.Time{}, nil
	}
	return *maxTime, nil
}

// UpsertProductTaxonomy insere ou atualiza um link de produto para taxonomy (role, confidence, source).
func (s *SQLStore) UpsertProductTaxonomy(productID, taxonomyID int64, role string, confidence float64, source string) error {
	_, err := s.db.Exec(`
		INSERT INTO catalogproduct_taxonomy (product_id, taxonomy_id, role, confidence, source, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (product_id, taxonomy_id) DO UPDATE SET
			role = EXCLUDED.role,
			confidence = EXCLUDED.confidence,
			source = EXCLUDED.source`, productID, taxonomyID, role, confidence, source)
	return err
}

// ListProductTaxonomies retorna todas as taxonomias associadas a um produto.
func (s *SQLStore) ListProductTaxonomies(productID int64) ([]models.CatalogProductTaxonomy, error) {
	var out []models.CatalogProductTaxonomy
	err := s.db.Select(&out, `
		SELECT product_id, taxonomy_id, role, confidence, source, created_at
		FROM catalogproduct_taxonomy
		WHERE product_id = $1
		ORDER BY confidence DESC, created_at DESC`, productID)
	return out, err
}

// MarkAutoMatchFalsePositive marca um auto_match_log como falso positivo com motivo.
func (s *SQLStore) MarkAutoMatchFalsePositive(logID int64, reason string) error {
	_, err := s.db.Exec(`
		UPDATE auto_match_logs
		SET false_positive = true,
		    false_positive_reason = $1,
		    false_positive_marked_at = NOW()
		WHERE id = $2`, reason, logID)
	return err
}

// ListFalsePositiveLogs retorna logs de auto_match marcados como falso positivo nos últimos N dias.
func (s *SQLStore) ListFalsePositiveLogs(sinceDays int) ([]models.AutoMatchLog, error) {
	var out []models.AutoMatchLog
	err := s.db.Select(&out, `
		SELECT id, product_id, channel_id, dispatch_id, score, created_at,
		       COALESCE(score_breakdown, '{}'::jsonb) AS score_breakdown,
		       COALESCE(match_reasons, '{}'::text[]) AS match_reasons,
		       false_positive, false_positive_reason, false_positive_marked_at
		FROM auto_match_logs
		WHERE false_positive = true AND false_positive_marked_at >= NOW() - INTERVAL '1 day' * $1
		ORDER BY false_positive_marked_at DESC`, sinceDays)
	return out, err
}

// UpdateAutoMatchScoreBreakdown atualiza score_breakdown e match_reasons de um log.
func (s *SQLStore) UpdateAutoMatchScoreBreakdown(logID int64, breakdown []byte, reasons []string) error {
	_, err := s.db.Exec(`
		UPDATE auto_match_logs
		SET score_breakdown = $1,
		    match_reasons = $2
		WHERE id = $3`, breakdown, pq.Array(reasons), logID)
	return err
}

// UpdateProductAttributesJSON atualiza o campo attributes (JSONB) de um produto.
func (s *SQLStore) UpdateProductAttributesJSON(productID int64, attrs []byte) error {
	_, err := s.db.Exec(`
		UPDATE catalogproduct
		SET attributes = $1
		WHERE id = $2`, attrs, productID)
	return err
}

// CountChannelClicksLast30d conta cliques de um canal nos últimos 30 dias.
func (s *SQLStore) CountChannelClicksLast30d(channelID int64) (int, error) {
	var count int
	err := s.db.Get(&count, `
		SELECT COUNT(*)
		FROM shortlink_clicks
		WHERE channel_id = $1 AND clicked_at > now() - interval '30 days'
	`, channelID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return count, err
}

// GetVariantBySourceSubID retorna uma variante por source e sub_id.
func (s *SQLStore) GetVariantBySourceSubID(source, subid string) (models.CatalogVariant, bool, error) {
	var v models.CatalogVariant
	err := s.db.Get(&v, `
		SELECT id, product_id, source, source_sub_id, url, title, short_id,
		       price, discount, discount_pct, stock, is_available, specs,
		       created_at, updated_at
		FROM catalogvariant
		WHERE source = $1 AND source_sub_id = $2
		LIMIT 1`, source, subid)
	if err == sql.ErrNoRows {
		return v, false, nil
	}
	return v, err == nil, err
}
