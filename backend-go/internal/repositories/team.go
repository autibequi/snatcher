package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

// ErrEmailTaken é retornado por TeamRepo.Invite quando email já existe.
var ErrEmailTaken = errors.New("email já cadastrado")

// TeamMember representa uma linha de users projetada para o admin.
type TeamMember struct {
	ID          int64  `db:"id" json:"id"`
	Email       string `db:"email" json:"email"`
	Name        string `db:"name" json:"name"`
	Role        string `db:"role" json:"role"`
	CreatedAt   string `db:"created_at" json:"created_at"`
	LastLoginAt string `db:"last_login_at" json:"last_login_at"`
}

// TeamRepo encapsula CRUD da tabela users sob a perspectiva admin (não auth).
type TeamRepo struct {
	DB *sqlx.DB
}

func NewTeamRepo(db *sqlx.DB) *TeamRepo {
	return &TeamRepo{DB: db}
}

// List devolve todos os membros do time, ordenados por created_at asc.
func (r *TeamRepo) List(ctx context.Context) ([]TeamMember, error) {
	var members []TeamMember
	err := r.DB.SelectContext(ctx, &members,
		`SELECT id, email, COALESCE(name,'') as name, role,
		        created_at::text, COALESCE(last_login_at::text,'') as last_login_at
		 FROM users ORDER BY created_at`)
	return members, err
}

// Invite cria novo user com email único.
// passwordHash é hash bcrypt já gerado (handler decide cost).
// Retorna ErrEmailTaken se email já existir.
func (r *TeamRepo) Invite(ctx context.Context, email, name, role, passwordHash string) (int64, error) {
	var id int64
	err := r.DB.QueryRowContext(ctx,
		`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (email) DO NOTHING RETURNING id`,
		email, passwordHash, name, role).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) || id == 0 {
		return 0, ErrEmailTaken
	}
	return id, err
}

// UpdateRole troca o role de um user.
func (r *TeamRepo) UpdateRole(ctx context.Context, id int64, role string) error {
	_, err := r.DB.ExecContext(ctx, `UPDATE users SET role = $1 WHERE id = $2`, role, id)
	return err
}

// Remove apaga o user pelo id.
func (r *TeamRepo) Remove(ctx context.Context, id int64) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}
