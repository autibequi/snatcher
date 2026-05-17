package repositories

import (
	"fmt"

	"snatcher/backendv2/internal/models"
)

// groupSpySelect contém as colunas base usadas em todas as queries de group_spies.
const groupSpySelect = `
	SELECT id, short_id, group_name, platform, invite_link,
	       reader_wa_id, reader_tg_id, remote_group_id,
	       active, joined_at, stats, deleted_at
	FROM group_spies`

// ListGroupSpies retorna todos os group spies sem deleted_at,
// opcionalmente filtrados por plataforma e status ativo.
func (s *SQLStore) ListGroupSpies(platform string, activeOnly bool) ([]models.GroupSpy, error) {
	query := groupSpySelect + ` WHERE deleted_at IS NULL`

	args := []interface{}{}
	argIndex := 1

	if platform != "" {
		query += fmt.Sprintf(` AND platform = $%d`, argIndex)
		args = append(args, platform)
		argIndex++
	}

	if activeOnly {
		query += fmt.Sprintf(` AND active = $%d`, argIndex)
		args = append(args, true)
		argIndex++
	}

	query += ` ORDER BY id`

	var out []models.GroupSpy
	err := s.db.Select(&out, query, args...)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []models.GroupSpy{}
	}
	return out, nil
}

// GetGroupSpy busca um group spy pelo ID, ignorando soft-deletes.
func (s *SQLStore) GetGroupSpy(id int64) (models.GroupSpy, error) {
	var spy models.GroupSpy
	err := s.db.Get(&spy, groupSpySelect+` WHERE id = $1 AND deleted_at IS NULL`, id)
	return spy, err
}

// CreateGroupSpy insere um novo group spy e retorna o ID gerado.
func (s *SQLStore) CreateGroupSpy(g models.GroupSpy) (int64, error) {
	var id int64
	err := s.db.QueryRowx(`
		INSERT INTO group_spies
		    (group_name, platform, invite_link, reader_wa_id, reader_tg_id, active)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, g.GroupName, g.Platform, g.InviteLink, g.ReaderWAID, g.ReaderTGID, g.Active).Scan(&id)
	return id, err
}

// UpdateGroupSpyReader atualiza os IDs de reader (WA e TG) de um group spy.
func (s *SQLStore) UpdateGroupSpyReader(id int64, readerWAID, readerTGID models.NullInt64) error {
	_, err := s.db.Exec(`
		UPDATE group_spies
		SET reader_wa_id = $1, reader_tg_id = $2
		WHERE id = $3 AND deleted_at IS NULL
	`, readerWAID, readerTGID, id)
	return err
}

// SoftDeleteGroupSpy marca um group spy como deletado sem remover do banco.
func (s *SQLStore) SoftDeleteGroupSpy(id int64) error {
	_, err := s.db.Exec(`
		UPDATE group_spies
		SET deleted_at = now(), active = false
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	return err
}
