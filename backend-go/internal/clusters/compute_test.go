package clusters

import (
	"testing"

	"snatcher/backendv2/internal/models"
)

func TestKMeans_Basic(t *testing.T) {
	features := [][]float64{
		{0.1, 0.1}, {0.2, 0.1}, // cluster A
		{0.9, 0.9}, {0.8, 0.9}, // cluster B
		{0.5, 0.5},              // meio
	}
	assignments := kmeans(features, 2, 50)
	if len(assignments) != 5 {
		t.Fatalf("expected 5 assignments, got %d", len(assignments))
	}
	// Os dois primeiros devem estar no mesmo cluster
	if assignments[0] != assignments[1] {
		t.Error("expected first two points in same cluster")
	}
	// Os dois do grupo B devem estar no mesmo cluster
	if assignments[2] != assignments[3] {
		t.Error("expected points 3-4 in same cluster")
	}
}

func TestKMeans_Empty(t *testing.T) {
	result := kmeans(nil, 3, 50)
	if result != nil {
		t.Error("expected nil for empty features")
	}
}

func TestKMeans_FewerThanK(t *testing.T) {
	features := [][]float64{{0.1, 0.2}, {0.9, 0.8}}
	result := kmeans(features, 5, 50)
	// Should still work — centroids capped to n
	if len(result) != 2 {
		t.Fatalf("expected 2 assignments, got %d", len(result))
	}
}

func TestExtractFeatures_Dims(t *testing.T) {
	chs := []models.Channel{
		{CTR30d: 0.05, CVR30d: 0.01},
		{CTR30d: 0.10, CVR30d: 0.02},
	}
	for i := range chs {
		chs[i].AudienceRaw = []byte(`{"min_drop":10,"min_price":100,"max_price":5000}`)
		_ = chs[i].UnmarshalAudience()
	}
	f := extractFeatures(chs)
	if len(f) != 2 {
		t.Fatalf("expected 2 feature vectors, got %d", len(f))
	}
	if len(f[0]) != 5 {
		t.Fatalf("expected 5 features, got %d", len(f[0]))
	}
}

func TestEuclidean(t *testing.T) {
	a := []float64{0.0, 0.0}
	b := []float64{3.0, 4.0}
	d := euclidean(a, b)
	if d < 4.99 || d > 5.01 {
		t.Errorf("expected euclidean distance ~5, got %f", d)
	}
}
