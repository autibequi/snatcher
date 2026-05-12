package store

import "snatcher/backendv2/internal/models"

// GroupAdmin stubs — implementações mínimas para satisfazer a interface Store.
// Os dados reais ficam em groups v2 (accounts/modems). Estes métodos são legado
// que ainda não foi migrado para remoção completa.

func (s *SQLStore) AddGroupAdmin(a models.GroupAdmin) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO group_admins (group_id, account_id, account_type) VALUES ($1, $2, $3) RETURNING id`,
		a.GroupID, a.AccountID, a.AccountType,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) GetRedesignGroup(id int64) (models.RedesignGroup, error) {
	var g models.RedesignGroup
	err := s.db.Get(&g, `SELECT * FROM groups WHERE id=$1`, id)
	return g, err
}

func (s *SQLStore) UpdateRedesignGroup(g models.RedesignGroup) error {
	_, err := s.db.Exec(
		`UPDATE groups SET name=$1, status=$2 WHERE id=$3`,
		g.Name, g.Status, g.ID,
	)
	return err
}
