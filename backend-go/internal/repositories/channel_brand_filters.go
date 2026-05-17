package repositories

import (
	"context"

	"github.com/jmoiron/sqlx"
)

// ChannelBrandFilter é uma linha de channel_brand_filters.
type ChannelBrandFilter struct {
	ID           int64  `db:"id"            json:"id"`
	BrandSlug    string `db:"brand_slug"    json:"brand_slug"`
	BrandDisplay string `db:"brand_display" json:"brand_display"`
	Mode         string `db:"mode"          json:"mode"`
}

// ChannelBrandFiltersRepo isola CRUD de channel_brand_filters da camada handler.
type ChannelBrandFiltersRepo struct {
	DB *sqlx.DB
}

func NewChannelBrandFiltersRepo(db *sqlx.DB) *ChannelBrandFiltersRepo {
	return &ChannelBrandFiltersRepo{DB: db}
}

// List devolve filtros de um canal ordenados por mode e brand_slug.
func (r *ChannelBrandFiltersRepo) List(ctx context.Context, channelID int64) ([]ChannelBrandFilter, error) {
	var rows []ChannelBrandFilter
	err := r.DB.SelectContext(ctx, &rows,
		`SELECT id, brand_slug, brand_display, mode
		 FROM channel_brand_filters
		 WHERE channel_id=$1
		 ORDER BY mode, brand_slug`, channelID)
	return rows, err
}

// Add cria ou ignora (ON CONFLICT DO NOTHING) um filtro de marca.
func (r *ChannelBrandFiltersRepo) Add(ctx context.Context, channelID int64, brandSlug, brandDisplay, mode string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO channel_brand_filters (channel_id, brand_slug, brand_display, mode)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (channel_id, brand_slug, mode) DO NOTHING
	`, channelID, brandSlug, brandDisplay, mode)
	return err
}

// Delete remove um filtro pelo id (escopado por channelID para evitar cross-channel).
func (r *ChannelBrandFiltersRepo) Delete(ctx context.Context, channelID, filterID int64) error {
	_, err := r.DB.ExecContext(ctx,
		`DELETE FROM channel_brand_filters WHERE id=$1 AND channel_id=$2`,
		filterID, channelID)
	return err
}
