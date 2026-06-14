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
		`INSERT INTO groups (name, platform, status, jid, invite_link, wa_account_id, tg_account_id, channel_id)
		 VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,0), NULLIF($7,0), NULLIF($8,0))
		 RETURNING id`,
		g.Name, g.Platform, g.Status,
		g.JID.String, g.InviteLink.String,
		g.WAAccountID.Int64, g.TGAccountID.Int64, g.ChannelID.Int64,
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
			channel_id=NULLIF($9,0), category_id=NULLIF($10,0)
		WHERE id=$11`,
		g.Name, g.Status, g.Platform,
		g.JID.String,
		g.InviteLink.String, g.MemberCount,
		g.WAAccountID.Int64, g.TGAccountID.Int64,
		g.ChannelID.Int64, g.CategoryID.Int64,
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

func (s *SQLStore) GetAnalyticsSummary(since time.Time, days int) (map[string]any, error) {
	return map[string]any{"since": since, "days": days}, nil
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
