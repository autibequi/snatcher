package algo

import (
	"context"
	"math"
	"time"

	"github.com/jmoiron/sqlx"
)

// ScoreInputs reúne os dados necessários para calcular o score de um item.
type ScoreInputs struct {
	CategoryID         *int64
	DiscountPct        float64
	FirstSeenAt        time.Time
	LastPriceDropAt    *time.Time
	SourceTrust        float64
	GroupCategoryMatch float64
}

// Params contém os parâmetros tunáveis lidos de tunable_parameters via get_param.
type Params struct {
	QualityThreshold     float64
	HalfLifeFreshness    float64
	HalfLifeLearned      float64
	AntiSaturationDecay  float64
	DiversityBonusWeight float64
	EpsilonBase          float64
	EpsilonDecayRate     float64
}

// ComputeScore aplica fórmula multiplicativa cimentada:
// discount × category_match × freshness × price_drop_boost × source_trust
func ComputeScore(in ScoreInputs, params Params) float64 {
	discountF := math.Min(in.DiscountPct/30.0, 2.0)
	if discountF <= 0 {
		return 0
	}
	if in.GroupCategoryMatch == 0 {
		return 0
	}

	halfLife := params.HalfLifeFreshness // dias
	hoursOld := time.Since(in.FirstSeenAt).Hours()
	freshness := math.Exp(-hoursOld / (halfLife * 24))

	priceDrop := 1.0
	if in.LastPriceDropAt != nil && time.Since(*in.LastPriceDropAt) < 24*time.Hour {
		priceDrop = 1.5
	}
	return discountF * in.GroupCategoryMatch * freshness * priceDrop * in.SourceTrust
}

// LoadParams busca todos os tunable_parameters relevantes via get_param.
func LoadParams(ctx context.Context, db *sqlx.DB) (Params, error) {
	p := Params{}
	fields := map[string]*float64{
		"quality_threshold":      &p.QualityThreshold,
		"half_life_freshness":    &p.HalfLifeFreshness,
		"half_life_learned":      &p.HalfLifeLearned,
		"anti_saturation_decay":  &p.AntiSaturationDecay,
		"diversity_bonus_weight": &p.DiversityBonusWeight,
		"epsilon_base":           &p.EpsilonBase,
		"epsilon_decay_rate":     &p.EpsilonDecayRate,
	}
	for k, v := range fields {
		if err := db.GetContext(ctx, v, "SELECT get_param($1,'global',NULL)", k); err != nil {
			return p, err
		}
	}
	return p, nil
}
