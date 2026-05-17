package repositories

import (
	"snatcher/backendv2/internal/models"
)

// CreateSpyMessage insere uma mensagem coletada de um grupo espionado.
func (s *SQLStore) CreateSpyMessage(m models.SpyMessage) error {
	_, err := s.db.Exec(`
		INSERT INTO spy_messages (spy_id, sender, text, media_url, collected_at)
		VALUES ($1, $2, $3, $4, COALESCE($5, now()))
	`, m.SpyID, m.Sender, m.Text, m.MediaURL, m.CollectedAt)
	return err
}

// ListSpyMessages retorna as mensagens mais recentes de um spy,
// limitadas a `limit` registros, ordenadas pela mais recente primeiro.
func (s *SQLStore) ListSpyMessages(spyID int64, limit int) ([]models.SpyMessage, error) {
	var out []models.SpyMessage
	err := s.db.Select(&out, `
		SELECT id, spy_id, sender, text, media_url, collected_at
		FROM spy_messages
		WHERE spy_id = $1
		ORDER BY collected_at DESC
		LIMIT $2
	`, spyID, limit)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []models.SpyMessage{}
	}
	return out, nil
}
