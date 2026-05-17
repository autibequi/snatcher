package jobs

// RunComputeClusters agrupa canais ativos em clusters usando KMeans Lloyd's
// sobre features derivadas dos últimos 30 dias de send_log + catalog.
//
// Features por canal:
//   - ctr_30d:    CTR médio dos grupos do canal (da learned_weights_channel ou 0)
//   - epc_30d:    EPC médio ponderado por samples
//   - avg_price:  preço médio dos itens enviados via catalog
//
// k=5 fixo (hardcoded inicial). Cron semanal domingo 02:00.
// Dependências de tabela ausentes (42P01) resultam em skip, não em erro fatal.

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"snatcher/backendv2/internal/models"
)

const clustersK = 5

// channelFeatureRow representa as features brutas lidas do DB por canal.
type channelFeatureRow struct {
	ChannelID    int64   `db:"channel_id"`
	ChannelName  string  `db:"channel_name"`
	CTR30d       float64 `db:"ctr_30d"`
	EPC30d       float64 `db:"epc_30d"`
	AvgPrice     float64 `db:"avg_price"`
	TopCategory  string  `db:"top_category"`
}

// clusterMetrics é serializado em clusters.metrics (JSONB).
type clusterMetrics struct {
	AvgCTR      float64 `json:"avg_ctr"`
	AvgEPC      float64 `json:"avg_epc"`
	AvgPrice    float64 `json:"avg_price"`
	MemberCount int     `json:"member_count"`
}

// RunComputeClusters executa o pipeline KMeans e persiste em clusters.
// Idempotente: ON CONFLICT (id) DO UPDATE.
func RunComputeClusters(ctx context.Context, db *sqlx.DB) error {
	rows, err := fetchChannelFeatures(ctx, db)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == pgUndefinedTable {
			slog.Info("compute_clusters: tabela ausente, skip", "detail", pqErr.Message)
			return nil
		}
		return fmt.Errorf("compute_clusters: fetch features: %w", err)
	}

	if len(rows) == 0 {
		slog.Info("compute_clusters: nenhum canal com dados, skip")
		return nil
	}

	k := clustersK
	if len(rows) < k {
		k = len(rows)
	}

	assignments := kmeansLloyd(rows, k)
	clusters := buildClusters(rows, assignments, k)

	if err := upsertComputedClusters(ctx, db, clusters); err != nil {
		return fmt.Errorf("compute_clusters: upsert: %w", err)
	}

	slog.Info("compute_clusters: done", "k", k, "channels", len(rows))
	return nil
}

// fetchChannelFeatures busca features por canal ativo com dados dos últimos 30 dias.
// Faz LEFT JOIN com learned_weights_channel para CTR/EPC; usa 0 se sem dados.
func fetchChannelFeatures(ctx context.Context, db *sqlx.DB) ([]channelFeatureRow, error) {
	q := `
	WITH
	channel_learned AS (
	    SELECT lwc.channel_id,
	           AVG(lwc.ctr_30d)                               AS ctr_30d,
	           CASE WHEN SUM(lwc.samples_30d) > 0
	                THEN SUM(lwc.epc_30d * lwc.samples_30d) / SUM(lwc.samples_30d)
	                ELSE 0 END                                AS epc_30d
	    FROM learned_weights_channel lwc
	    GROUP BY lwc.channel_id
	),
	channel_price AS (
	    SELECT g.channel_id,
	           AVG(c.price)                                   AS avg_price
	    FROM send_log sl
	    JOIN groups  g ON g.id  = sl.group_id
	    JOIN catalog c ON c.id  = sl.catalog_id
	    WHERE sl.sent_at > now() - INTERVAL '30 days'
	      AND sl.status  = 'sent'
	      AND g.channel_id IS NOT NULL
	      AND c.price IS NOT NULL
	    GROUP BY g.channel_id
	),
	top_cat AS (
	    SELECT DISTINCT ON (g.channel_id)
	           g.channel_id,
	           tax.name                                       AS top_category
	    FROM send_log sl
	    JOIN groups  g   ON g.id  = sl.group_id
	    JOIN catalog c   ON c.id  = sl.catalog_id
	    JOIN taxonomy tax ON tax.id = c.category_id
	    WHERE sl.sent_at > now() - INTERVAL '30 days'
	      AND sl.status  = 'sent'
	      AND g.channel_id IS NOT NULL
	    GROUP BY g.channel_id, tax.name
	    ORDER BY g.channel_id, COUNT(*) DESC
	)
	SELECT
	    ch.id                                                 AS channel_id,
	    ch.name                                               AS channel_name,
	    COALESCE(cl.ctr_30d, 0)                               AS ctr_30d,
	    COALESCE(cl.epc_30d, 0)                               AS epc_30d,
	    COALESCE(cp.avg_price, 0)                             AS avg_price,
	    COALESCE(tc.top_category, 'sem_categoria')            AS top_category
	FROM channels ch
	LEFT JOIN channel_learned cl ON cl.channel_id = ch.id
	LEFT JOIN channel_price   cp ON cp.channel_id = ch.id
	LEFT JOIN top_cat         tc ON tc.channel_id = ch.id
	WHERE ch.active = true
	ORDER BY ch.id
	`
	var out []channelFeatureRow
	if err := db.SelectContext(ctx, &out, q); err != nil {
		return nil, err
	}
	return out, nil
}

// kmeansLloyd executa Lloyd's KMeans sobre 3 features: ctr_30d, epc_30d, avg_price.
// Retorna slice de assignments (cluster index por elemento).
func kmeansLloyd(rows []channelFeatureRow, k int) []int {
	n := len(rows)
	assignments := make([]int, n)
	// seed com primeiros k pontos distintos (shuffled)
	indices := rand.Perm(n)
	centroids := make([][3]float64, k)
	for i := 0; i < k; i++ {
		r := rows[indices[i]]
		centroids[i] = [3]float64{r.CTR30d, r.EPC30d, r.AvgPrice}
	}

	const maxIter = 100
	for iter := 0; iter < maxIter; iter++ {
		changed := false

		// Assign step
		for i, r := range rows {
			pt := [3]float64{r.CTR30d, r.EPC30d, r.AvgPrice}
			best, bestDist := 0, math.MaxFloat64
			for ci, c := range centroids {
				d := euclideanSq(pt, c)
				if d < bestDist {
					bestDist = d
					best = ci
				}
			}
			if assignments[i] != best {
				assignments[i] = best
				changed = true
			}
		}
		if !changed {
			break
		}

		// Update step
		sums := make([][3]float64, k)
		counts := make([]int, k)
		for i, r := range rows {
			ci := assignments[i]
			sums[ci][0] += r.CTR30d
			sums[ci][1] += r.EPC30d
			sums[ci][2] += r.AvgPrice
			counts[ci]++
		}
		for ci := range centroids {
			if counts[ci] > 0 {
				centroids[ci][0] = sums[ci][0] / float64(counts[ci])
				centroids[ci][1] = sums[ci][1] / float64(counts[ci])
				centroids[ci][2] = sums[ci][2] / float64(counts[ci])
			}
		}
	}
	return assignments
}

func euclideanSq(a, b [3]float64) float64 {
	d0 := a[0] - b[0]
	d1 := a[1] - b[1]
	d2 := a[2] - b[2]
	return d0*d0 + d1*d1 + d2*d2
}

// buildClusters agrega os rows por assignment e produz []models.Cluster.
func buildClusters(rows []channelFeatureRow, assignments []int, k int) []models.Cluster {
	type agg struct {
		ids        []int64
		sumCTR     float64
		sumEPC     float64
		sumPrice   float64
		catCounts  map[string]int
	}
	groups := make([]agg, k)
	for i := range groups {
		groups[i].catCounts = make(map[string]int)
	}

	for i, r := range rows {
		ci := assignments[i]
		groups[ci].ids = append(groups[ci].ids, r.ChannelID)
		groups[ci].sumCTR += r.CTR30d
		groups[ci].sumEPC += r.EPC30d
		groups[ci].sumPrice += r.AvgPrice
		groups[ci].catCounts[r.TopCategory]++
	}

	now := time.Now()
	result := make([]models.Cluster, 0, k)
	for ci, g := range groups {
		if len(g.ids) == 0 {
			continue
		}
		n := float64(len(g.ids))
		avgCTR := g.sumCTR / n
		avgEPC := g.sumEPC / n
		avgPrice := g.sumPrice / n

		topCat := topKey(g.catCounts)
		label := fmt.Sprintf("%s cluster %d", topCat, ci+1)
		desc := fmt.Sprintf("Cluster %d: %d canais, CTR %.2f%%, preço médio R$%.0f",
			ci+1, len(g.ids), avgCTR*100, avgPrice)

		metrics := clusterMetrics{
			AvgCTR:      math.Round(avgCTR*10000) / 10000,
			AvgEPC:      math.Round(avgEPC*100) / 100,
			AvgPrice:    math.Round(avgPrice*100) / 100,
			MemberCount: len(g.ids),
		}
		metricsJSON, _ := json.Marshal(metrics)
		memberJSON, _ := json.Marshal(g.ids)
		topCatJSON, _ := json.Marshal([]string{topCat})

		result = append(result, models.Cluster{
			ID:             int64(ci + 1),
			Label:          label,
			Description:    desc,
			MemberChannels: memberJSON,
			Metrics:        metricsJSON,
			TopCategories:  topCatJSON,
			TopBrands:      []byte("[]"),
			ComputedAt:     now,
		})
	}
	return result
}

// topKey retorna a chave com maior count no map.
func topKey(m map[string]int) string {
	best, bestCount := "", 0
	for k, v := range m {
		if v > bestCount {
			bestCount = v
			best = k
		}
	}
	return best
}

// upsertComputedClusters persiste os clusters calculados via store.UpsertClusters (ON CONFLICT id DO UPDATE).
func upsertComputedClusters(ctx context.Context, db *sqlx.DB, clusters []models.Cluster) error {
	for _, cl := range clusters {
		_, err := db.ExecContext(ctx, `
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
		`, cl.ID, cl.Label, cl.Description, cl.MemberChannels,
			cl.Metrics, cl.TopCategories, cl.TopBrands, cl.ComputedAt)
		if err != nil {
			return err
		}
	}
	return nil
}
