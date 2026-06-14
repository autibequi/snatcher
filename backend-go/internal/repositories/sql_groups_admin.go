package repositories

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"snatcher/backendv2/internal/models"
)


// ---- GroupAdmin ----

func (s *SQLStore) ListGroupAdmins(groupID int64) ([]models.GroupAdmin, error) {
	var out []models.GroupAdmin
	err := s.db.Select(&out, `SELECT id, group_id, account_type, account_id, added_at FROM group_admins WHERE group_id=$1`, groupID)
	return out, err
}

func (s *SQLStore) AddGroupAdmin(a models.GroupAdmin) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO group_admins (group_id, account_id, account_type) VALUES ($1, $2, $3) RETURNING id`,
		a.GroupID, a.AccountID, a.AccountType,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) DeleteGroupAdmin(id int64) error {
	_, err := s.db.Exec(`DELETE FROM group_admins WHERE id=$1`, id)
	return err
}

func (s *SQLStore) CountGroupAdmins(groupID int64) (int, error) {
	var n int
	err := s.db.Get(&n, `SELECT COUNT(*) FROM group_admins WHERE group_id=$1`, groupID)
	return n, err
}

// ---- RedesignGroups (groups table v2) ----

func (s *SQLStore) ListRedesignGroups(channelID int64, platform, status string) ([]models.RedesignGroup, error) {
	var out []models.RedesignGroup
	err := s.db.Select(&out, `SELECT * FROM groups WHERE ($1=0 OR channel_id=$1) AND ($2='' OR platform=$2) AND ($3='' OR status=$3)`, channelID, platform, status)
	return out, err
}

func (s *SQLStore) GetRedesignGroup(id int64) (models.RedesignGroup, error) {
	var g models.RedesignGroup
	err := s.db.Get(&g, `SELECT * FROM groups WHERE id=$1`, id)
	return g, err
}

func (s *SQLStore) CreateRedesignGroup(g models.RedesignGroup) (int64, error) {
	var id int64
	// O INSERT antigo só gravava name/platform/status e descartava jid, conta e canal —
	// por isso todo grupo "importado" nascia sem jid (duplicava, virava fantasma e nunca
	// recebia mensagem). Persiste os mesmos campos que UpdateRedesignGroup.
	err := s.db.QueryRow(
		`INSERT INTO groups (name, platform, status, jid, invite_link, wa_account_id, tg_account_id, channel_id, daily_msg_cap)
		 VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,0), NULLIF($7,0), NULLIF($8,0), $9)
		 RETURNING id`,
		g.Name, g.Platform, g.Status,
		g.JID.String, g.InviteLink.String,
		g.WAAccountID.Int64, g.TGAccountID.Int64, g.ChannelID.Int64,
		g.DailyMsgCap,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateRedesignGroup(g models.RedesignGroup) error {
	_, err := s.db.Exec(`
		UPDATE groups SET
			name=$1, status=$2, platform=$3,
			jid=NULLIF($4,''),
			invite_link=NULLIF($5,''), member_count=$6,
			wa_account_id=NULLIF($7,0), tg_account_id=NULLIF($8,0),
			channel_id=NULLIF($9,0), category_id=NULLIF($10,0),
			daily_msg_cap=$11
		WHERE id=$12`,
		g.Name, g.Status, g.Platform,
		g.JID.String,
		g.InviteLink.String, g.MemberCount,
		g.WAAccountID.Int64, g.TGAccountID.Int64,
		g.ChannelID.Int64, g.CategoryID.Int64,
		g.DailyMsgCap,
		g.ID,
	)
	return err
}

func (s *SQLStore) DeleteRedesignGroup(id int64) error {
	_, err := s.db.Exec(`UPDATE groups SET status='banned' WHERE id=$1`, id)
	return err
}

func (s *SQLStore) CountGroupsWithSameJID(platform, jid string) (int, error) {
	var n int
	err := s.db.Get(&n, `SELECT COUNT(*) FROM groups WHERE platform=$1 AND jid=$2`, platform, jid)
	return n, err
}

func (s *SQLStore) FindConflictingRedesignGroup(g models.RedesignGroup, excludeID int64) (*models.RedesignGroup, error) {
	var out models.RedesignGroup
	err := s.db.Get(&out, `SELECT * FROM groups WHERE platform=$1 AND jid=$2 AND id<>$3 LIMIT 1`, g.Platform, g.JID, excludeID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *SQLStore) SetGroupArchived(id int64, archived bool, lastError *string) error {
	_, err := s.db.Exec(`UPDATE groups SET archived=$1 WHERE id=$2`, archived, id)
	return err
}

// ---- Analytics ----

// GetAnalyticsSummary agrega cliques (tabela clicks) + envios + catálogo no período.
// Era um stub que devolvia {since,days} → a aba Analytics sempre mostrava "sem dados"
// mesmo com cliques no banco. Agora consulta de verdade (descoberto via simulação
// de clique controlada, 2026-06-14). Cliques sem catalog_id/group_id (links não
// vinculados a produto/grupo) contam em total/unique mas não nos breakdowns.
func (s *SQLStore) GetAnalyticsSummary(since time.Time, days int) (map[string]any, error) {
	out := map[string]any{"since": since, "days": days}

	var total, unique int64
	_ = s.db.Get(&total, `SELECT COUNT(*) FROM clicks WHERE clicked_at >= $1`, since)
	_ = s.db.Get(&unique, `SELECT COUNT(DISTINCT ip) FROM clicks WHERE clicked_at >= $1 AND ip IS NOT NULL`, since)
	out["total"] = total
	out["unique"] = unique

	var sent int64
	_ = s.db.Get(&sent, `SELECT COUNT(*) FROM send_log WHERE sent_at >= $1`, since)
	out["messages_sent"] = sent

	var catTotal, catNew int64
	_ = s.db.Get(&catTotal, `SELECT COUNT(*) FROM catalog`)
	_ = s.db.Get(&catNew, `SELECT COUNT(*) FROM catalog WHERE created_at >= $1`, since)
	out["catalog_total"] = catTotal
	out["catalog_new"] = catNew

	type dRow struct {
		Date   string `db:"date"`
		Clicks int64  `db:"clicks"`
	}
	var drs []dRow
	_ = s.db.Select(&drs, `SELECT to_char(clicked_at, 'YYYY-MM-DD') AS date, COUNT(*) AS clicks
		FROM clicks WHERE clicked_at >= $1 GROUP BY 1 ORDER BY 1`, since)
	daily := make([]map[string]any, 0, len(drs))
	for _, d := range drs {
		daily = append(daily, map[string]any{"date": d.Date, "clicks": d.Clicks})
	}
	out["daily"] = daily

	type srcRow struct {
		Source string `db:"source"`
		Clicks int64  `db:"clicks"`
	}
	var srs []srcRow
	_ = s.db.Select(&srs, `SELECT c.source_id AS source, COUNT(*) AS clicks
		FROM clicks k JOIN catalog c ON c.id = k.catalog_id
		WHERE k.clicked_at >= $1 GROUP BY c.source_id ORDER BY clicks DESC`, since)
	bySource := make([]map[string]any, 0, len(srs))
	for _, r := range srs {
		bySource = append(bySource, map[string]any{"source": r.Source, "clicks": r.Clicks})
	}
	out["by_source"] = bySource

	type grpRow struct {
		ID     int64  `db:"id"`
		Name   string `db:"name"`
		Clicks int64  `db:"clicks"`
	}
	var grs []grpRow
	_ = s.db.Select(&grs, `SELECT g.id, g.name, COUNT(*) AS clicks
		FROM clicks k JOIN groups g ON g.id = k.group_id
		WHERE k.clicked_at >= $1 GROUP BY g.id, g.name ORDER BY clicks DESC LIMIT 20`, since)
	byGroup := make([]map[string]any, 0, len(grs))
	for _, r := range grs {
		byGroup = append(byGroup, map[string]any{"id": r.ID, "name": r.Name, "clicks": r.Clicks})
	}
	out["by_group"] = byGroup

	type catRow struct {
		ID     int64  `db:"id"`
		Name   string `db:"name"`
		Slug   string `db:"slug"`
		Clicks int64  `db:"clicks"`
	}
	var crs []catRow
	_ = s.db.Select(&crs, `SELECT cat.id, cat.display_name AS name, cat.slug, COUNT(*) AS clicks
		FROM clicks k JOIN catalog c ON c.id = k.catalog_id JOIN categories cat ON cat.id = c.category_id
		WHERE k.clicked_at >= $1 GROUP BY cat.id, cat.display_name, cat.slug ORDER BY clicks DESC LIMIT 20`, since)
	byCat := make([]map[string]any, 0, len(crs))
	for _, r := range crs {
		byCat = append(byCat, map[string]any{"id": r.ID, "name": r.Name, "slug": r.Slug, "clicks": r.Clicks})
	}
	out["by_category"] = byCat

	type prodRow struct {
		ID     int64   `db:"id"`
		Title  string  `db:"title"`
		Source string  `db:"source"`
		Price  float64 `db:"price"`
		Clicks int64   `db:"clicks"`
	}
	var prs []prodRow
	_ = s.db.Select(&prs, `SELECT c.id, c.title, c.source_id AS source, COALESCE(c.price_current,0) AS price, COUNT(*) AS clicks
		FROM clicks k JOIN catalog c ON c.id = k.catalog_id
		WHERE k.clicked_at >= $1 GROUP BY c.id, c.title, c.source_id, c.price_current ORDER BY clicks DESC LIMIT 10`, since)
	top := make([]map[string]any, 0, len(prs))
	for _, r := range prs {
		top = append(top, map[string]any{"id": r.ID, "title": r.Title, "source": r.Source, "price": r.Price, "clicks": r.Clicks})
	}
	out["top_products"] = top

	return out, nil
}

func (s *SQLStore) CountChannelClicksLast30d(channelID int64) (int, error) {
	var n int
	_ = s.db.Get(&n, `SELECT COUNT(*) FROM clicks WHERE group_id=$1 AND clicked_at > now()-INTERVAL '30 days'`, channelID)
	return n, nil
}

// ---- Operational / seed ----

func (s *SQLStore) SoftWipeOperationalData() error {
	_, err := s.db.Exec(`UPDATE groups SET status='banned' WHERE status='active'`)
	return err
}

func (s *SQLStore) ReseedTaxonomySeedInserts() error   { return nil }
func (s *SQLStore) ReseedCrawlerChannelSeedInserts() error { return nil }

// ---- Context stub ----
var _ context.Context // ensure import used
