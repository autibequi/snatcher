package repositories

import (
	"github.com/jmoiron/sqlx"
)

type SQLStore struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) Store {
	return &SQLStore{db: db}
}

// insertReturningID executa um NamedExec com RETURNING id para compatibilidade Postgres.
// Substitui o padrão res.LastInsertId() que não funciona no driver pq.
func insertReturningID(db *sqlx.DB, query string, arg interface{}) (int64, error) {
	query = query + " RETURNING id"
	rows, err := sqlx.NamedQuery(db, query, arg)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var id int64
	if rows.Next() {
		if err := rows.Scan(&id); err != nil {
			return 0, err
		}
	}
	return id, nil
}
