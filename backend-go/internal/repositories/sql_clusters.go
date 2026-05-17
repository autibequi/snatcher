package repositories

import (
	"snatcher/backendv2/internal/models"
)

// ListClusters retorna todos os clusters analíticos disponíveis, ordenados por id.
func (s *SQLStore) ListClusters() ([]models.Cluster, error) {
	var out []models.Cluster
	err := s.db.Select(&out, `
		SELECT id, label, description, member_channels, metrics,
		       top_categories, top_brands, computed_at
		FROM clusters
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []models.Cluster{}
	}
	return out, nil
}

// GetCluster busca um cluster pelo ID.
func (s *SQLStore) GetCluster(id int64) (models.Cluster, error) {
	var cluster models.Cluster
	err := s.db.Get(&cluster, `
		SELECT id, label, description, member_channels, metrics,
		       top_categories, top_brands, computed_at
		FROM clusters
		WHERE id = $1
	`, id)
	return cluster, err
}

// UpsertClusters insere ou atualiza um batch de clusters.
// Conflito no id faz UPDATE de todos os campos de análise.
func (s *SQLStore) UpsertClusters(clusters []models.Cluster) error {
	for _, cluster := range clusters {
		_, err := s.db.Exec(`
			INSERT INTO clusters
			    (id, label, description, member_channels, metrics, top_categories, top_brands, computed_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (id) DO UPDATE SET
			    label           = EXCLUDED.label,
			    description     = EXCLUDED.description,
			    member_channels = EXCLUDED.member_channels,
			    metrics         = EXCLUDED.metrics,
			    top_categories  = EXCLUDED.top_categories,
			    top_brands      = EXCLUDED.top_brands,
			    computed_at     = EXCLUDED.computed_at
		`, cluster.ID, cluster.Label, cluster.Description,
			cluster.MemberChannels, cluster.Metrics,
			cluster.TopCategories, cluster.TopBrands, cluster.ComputedAt)
		if err != nil {
			return err
		}
	}
	return nil
}
