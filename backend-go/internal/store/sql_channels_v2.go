package store

import "snatcher/backendv2/internal/models"

func (s *SQLStore) ListChannelsV2() ([]models.ChannelV2, error) {
	var out []models.ChannelV2
	err := s.db.Select(&out, `SELECT id, name, quality_threshold, daily_cap, active, created_at FROM channels_v2 ORDER BY name`)
	return out, err
}

func (s *SQLStore) GetChannelV2(id int64) (models.ChannelV2, error) {
	var c models.ChannelV2
	err := s.db.Get(&c, `SELECT id, name, quality_threshold, daily_cap, active, created_at FROM channels_v2 WHERE id=$1`, id)
	return c, err
}

func (s *SQLStore) CreateChannelV2(c models.ChannelV2) (int64, error) {
	var id int64
	err := s.db.QueryRowx(`
		INSERT INTO channels_v2 (name, quality_threshold, daily_cap, active)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, c.Name, c.QualityThreshold, c.DailyCap, c.Active).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateChannelV2(c models.ChannelV2) error {
	_, err := s.db.Exec(`
		UPDATE channels_v2 SET name=$1, quality_threshold=$2, daily_cap=$3, active=$4 WHERE id=$5
	`, c.Name, c.QualityThreshold, c.DailyCap, c.Active, c.ID)
	return err
}

func (s *SQLStore) DeleteChannelV2(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channels_v2 WHERE id=$1`, id)
	return err
}

func (s *SQLStore) ListGroupsByChannel(channelID int64) ([]models.RedesignGroup, error) {
	var out []models.RedesignGroup
	err := s.db.Select(&out, `SELECT * FROM groups WHERE channel_id=$1 ORDER BY name`, channelID)
	return out, err
}

func (s *SQLStore) SetGroupChannel(groupID, channelID int64) error {
	_, err := s.db.Exec(`UPDATE groups SET channel_id=$1 WHERE id=$2`, channelID, groupID)
	return err
}

func (s *SQLStore) UnsetGroupChannel(groupID int64) error {
	_, err := s.db.Exec(`UPDATE groups SET channel_id=NULL WHERE id=$1`, groupID)
	return err
}

func (s *SQLStore) ListChannelCategoryWeights(channelID int64) ([]models.ChannelCategoryWeight, error) {
	var out []models.ChannelCategoryWeight
	err := s.db.Select(&out, `
		SELECT channel_id, category_id, weight FROM channel_category_weights
		WHERE channel_id=$1 ORDER BY category_id
	`, channelID)
	return out, err
}

func (s *SQLStore) SetChannelCategoryWeights(channelID int64, weights []models.ChannelCategoryWeight) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM channel_category_weights WHERE channel_id=$1`, channelID); err != nil {
		return err
	}
	for _, w := range weights {
		if w.Weight <= 0 {
			continue
		}
		if _, err := tx.Exec(`
			INSERT INTO channel_category_weights (channel_id, category_id, weight) VALUES ($1,$2,$3)
			ON CONFLICT (channel_id, category_id) DO UPDATE SET weight=$3
		`, channelID, w.CategoryID, w.Weight); err != nil {
			return err
		}
	}
	return tx.Commit()
}
