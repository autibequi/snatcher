package clusters

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"math/rand"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

const defaultK = 3

// Compute roda a análise de clusters sobre os canais ativos e persiste no store.
func Compute(ctx context.Context, st store.Store, llmCli llm.Client) error {
	channels, err := st.ListChannels()
	if err != nil {
		return err
	}

	// Desserializar audience de cada canal
	for i := range channels {
		_ = channels[i].UnmarshalAudience()
	}

	if len(channels) < defaultK {
		slog.Warn("clusters: not enough channels to compute", "count", len(channels), "required", defaultK)
		return nil
	}

	// Extrair features (vetores float64 simples)
	features := extractFeatures(channels)

	// Rodar KMeans
	k := defaultK
	if len(channels) < k {
		k = len(channels)
	}
	assignments := kmeans(features, k, 50) // max 50 iterações

	// Agrupar canais por cluster
	clustered := make([][]models.Channel, k)
	for i, a := range assignments {
		clustered[a] = append(clustered[a], channels[i])
	}

	// Gerar labels via LLM e preparar modelos
	labeler := NewLabeler(llmCli)
	var clusterModels []models.Cluster
	for _, group := range clustered {
		if len(group) == 0 {
			continue
		}
		cats, brands := ExtractTopFromChannels(group)

		// Calcular métricas médias
		var ctrSum, cvrSum, revSum float64
		for _, ch := range group {
			ctrSum += ch.CTR30d
			cvrSum += ch.CVR30d
			revSum += ch.Revenue30d
		}
		n := float64(len(group))
		input := RenderInput{
			TopCategories: cats,
			TopBrands:     brands,
			CTR:           ctrSum / n * 100,
			CVR:           cvrSum / n * 100,
			AvgTicket:     revSum / n,
			MemberCount:   len(group),
		}

		label := labeler.Label(ctx, input)

		// Serializar campos
		memberIDs := make([]int64, len(group))
		for j, ch := range group {
			memberIDs[j] = ch.ID
		}
		memberBytes, _ := json.Marshal(memberIDs)
		catsBytes, _ := json.Marshal(cats)
		brandsBytes, _ := json.Marshal(brands)
		metricsBytes, _ := json.Marshal(map[string]float64{
			"ctr": input.CTR, "cvr": input.CVR, "avg_ticket": input.AvgTicket,
		})

		clusterModels = append(clusterModels, models.Cluster{
			Label:          label.Label,
			Description:    label.Description,
			MemberChannels: memberBytes,
			Metrics:        metricsBytes,
			TopCategories:  catsBytes,
			TopBrands:      brandsBytes,
		})
	}

	if err := st.UpsertClusters(clusterModels); err != nil {
		return err
	}

	slog.Info("clusters: recomputed", "clusters", len(clusterModels), "channels", len(channels))
	return nil
}

// extractFeatures converte canais em vetores numéricos normalizados.
func extractFeatures(channels []models.Channel) [][]float64 {
	features := make([][]float64, len(channels))
	for i, ch := range channels {
		aud := ch.Audience
		// Feature vector: [min_drop/100, min_price/10000, max_price/10000, ctr, cvr]
		features[i] = []float64{
			aud.MinDrop / 100.0,
			aud.MinPrice / 10000.0,
			aud.MaxPrice / 10000.0,
			ch.CTR30d,
			ch.CVR30d,
		}
	}
	return features
}

// kmeans roda K-means com inicialização aleatória.
func kmeans(features [][]float64, k, maxIter int) []int {
	n := len(features)
	if n == 0 || k == 0 {
		return nil
	}
	if k > n {
		k = n
	}
	dim := len(features[0])

	// Inicializar centroids aleatoriamente
	perm := rand.Perm(n)
	centroids := make([][]float64, k)
	for i := 0; i < k; i++ {
		centroids[i] = make([]float64, dim)
		copy(centroids[i], features[perm[i]])
	}

	assignments := make([]int, n)
	for iter := 0; iter < maxIter; iter++ {
		// Atribuir cada ponto ao centroid mais próximo
		changed := false
		for i, f := range features {
			best, bestDist := 0, math.MaxFloat64
			for j, c := range centroids {
				d := euclidean(f, c)
				if d < bestDist {
					bestDist = d
					best = j
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

		// Recalcular centroids
		counts := make([]int, k)
		newCentroids := make([][]float64, k)
		for j := 0; j < k; j++ {
			newCentroids[j] = make([]float64, dim)
		}
		for i, a := range assignments {
			counts[a]++
			for d := 0; d < dim; d++ {
				newCentroids[a][d] += features[i][d]
			}
		}
		for j := 0; j < k; j++ {
			if counts[j] > 0 {
				for d := 0; d < dim; d++ {
					newCentroids[j][d] /= float64(counts[j])
				}
				centroids[j] = newCentroids[j]
			}
		}
	}
	return assignments
}

func euclidean(a, b []float64) float64 {
	var sum float64
	for i := range a {
		d := a[i] - b[i]
		sum += d * d
	}
	return math.Sqrt(sum)
}
