package store

import (
	"snatcher/backendv2/internal/models"
)

func (s *SQLStore) ListAds(activeOnly bool) ([]models.Ad, error) {
	var out []models.Ad
	q := `
		SELECT id, name, message_text, image_url, channel_ids, group_ids,
		       schedule_cron, active_until, enabled, last_dispatched_at, dispatch_count,
		       created_at, updated_at
		FROM ads
		WHERE ($1 = false OR (enabled = true AND (active_until IS NULL OR active_until > now())))
		ORDER BY enabled DESC, created_at DESC`
	err := s.db.Select(&out, q, activeOnly)
	return out, err
}

func (s *SQLStore) GetAd(id int64) (models.Ad, error) {
	var a models.Ad
	err := s.db.Get(&a, `
		SELECT id, name, message_text, image_url, channel_ids, group_ids,
		       schedule_cron, active_until, enabled, last_dispatched_at, dispatch_count,
		       created_at, updated_at
		FROM ads WHERE id = $1`, id)
	return a, err
}

func (s *SQLStore) CreateAd(a models.Ad) (int64, error) {
	if a.ScheduleCron == "" {
		a.ScheduleCron = "0 12 * * *"
	}
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO ads (name, message_text, image_url, channel_ids, group_ids, schedule_cron, active_until, enabled)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		a.Name, a.MessageText, a.ImageURL, a.ChannelIDs, a.GroupIDs,
		a.ScheduleCron, a.ActiveUntil, a.Enabled,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateAd(a models.Ad) error {
	_, err := s.db.Exec(`
		UPDATE ads SET
		  name = $1, message_text = $2, image_url = $3,
		  channel_ids = $4, group_ids = $5,
		  schedule_cron = $6, active_until = $7, enabled = $8,
		  updated_at = now()
		WHERE id = $9`,
		a.Name, a.MessageText, a.ImageURL, a.ChannelIDs, a.GroupIDs,
		a.ScheduleCron, a.ActiveUntil, a.Enabled, a.ID,
	)
	return err
}

func (s *SQLStore) DeleteAd(id int64) error {
	_, err := s.db.Exec(`DELETE FROM ads WHERE id = $1`, id)
	return err
}

func (s *SQLStore) MarkAdDispatched(id int64) error {
	_, err := s.db.Exec(`
		UPDATE ads SET last_dispatched_at = now(), dispatch_count = dispatch_count + 1
		WHERE id = $1`, id)
	return err
}
