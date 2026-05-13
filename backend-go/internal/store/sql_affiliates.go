package store

import (
	"snatcher/backendv2/internal/models"
)

func (s *SQLStore) CreateAffiliateProgram(p models.AffiliateProgram) (int64, error) {
	var id int64
	err := s.db.QueryRowx(`
		INSERT INTO affiliate_programs (name, marketplace, credentials, active, rules, postback)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, p.Name, p.Marketplace, p.Credentials, p.Active, p.Rules, p.Postback).Scan(&id)
	return id, err
}

func (s *SQLStore) GetAffiliateProgram(id int64) (models.AffiliateProgram, error) {
	var p models.AffiliateProgram
	err := s.db.Get(&p, `
		SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at
		FROM affiliate_programs WHERE id = $1
	`, id)
	return p, err
}

func (s *SQLStore) UpdateAffiliateProgram(p models.AffiliateProgram) error {
	_, err := s.db.Exec(`
		UPDATE affiliate_programs
		SET name=$1, marketplace=$2, credentials=$3, active=$4, rules=$5, postback=$6
		WHERE id=$7
	`, p.Name, p.Marketplace, p.Credentials, p.Active, p.Rules, p.Postback, p.ID)
	return err
}

func (s *SQLStore) DeleteAffiliateProgram(id int64) error {
	_, err := s.db.Exec(`DELETE FROM affiliate_programs WHERE id=$1`, id)
	return err
}

func (s *SQLStore) ListAffiliatePrograms(active *bool) ([]models.AffiliateProgram, error) {
	query := `SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at FROM affiliate_programs`
	if active != nil {
		query += ` WHERE active=$1 ORDER BY marketplace, id`
		var out []models.AffiliateProgram
		err := s.db.Select(&out, query, *active)
		return out, err
	}
	query += ` ORDER BY marketplace, id`
	var out []models.AffiliateProgram
	err := s.db.Select(&out, query)
	return out, err
}

func (s *SQLStore) ListAffiliateProgramsByMarketplace(marketplace string) ([]models.AffiliateProgram, error) {
	var out []models.AffiliateProgram
	err := s.db.Select(&out, `
		SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at
		FROM affiliate_programs
		WHERE marketplace=$1 AND active=true
		ORDER BY id
	`, marketplace)
	return out, err
}
