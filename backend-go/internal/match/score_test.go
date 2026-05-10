package match

import (
	"testing"

	"snatcher/backendv2/internal/models"
)

func makeChannel(id int64, audienceJSON string) models.Channel {
	ch := models.Channel{ID: id, Name: "ch"}
	ch.AudienceRaw = []byte(audienceJSON)
	return ch
}

func TestScoreChannel_ExactMatch(t *testing.T) {
	ch := makeChannel(1, `{"categories":["eletronicos"],"min_drop":10,"min_price":100,"max_price":5000}`)
	product := ProductInput{Category: "eletronicos", Brand: "samsung", Price: 1500, Drop: 15}
	score := ScoreChannel(product, ch, defaultWeights)
	if score.Value < 60 {
		t.Errorf("expected score >= 60 for matching product, got %.0f", score.Value)
	}
	if len(score.Reasons) == 0 {
		t.Error("expected at least one reason")
	}
}

func TestScoreChannel_DropBelowMin(t *testing.T) {
	ch := makeChannel(2, `{"min_drop":20}`)
	product := ProductInput{Category: "eletronicos", Drop: 5}
	score := ScoreChannel(product, ch, defaultWeights)
	// drop=5 < min_drop=20 → ramp 5/20=0.25 → score deve ser menor que caso drop>=min
	if score.Value >= 80 {
		t.Errorf("expected low score for drop below min, got %.0f", score.Value)
	}
}

func TestScoreChannel_NoCategoryFilter(t *testing.T) {
	// Canal sem filtro de categoria → neutro (0.5)
	ch := makeChannel(3, `{}`)
	product := ProductInput{Category: "moda", Price: 200, Drop: 5}
	score := ScoreChannel(product, ch, defaultWeights)
	if score.Value <= 0 {
		t.Errorf("expected positive score for channel with no filters, got %.0f", score.Value)
	}
}

func TestScoreChannel_CategoryMismatch(t *testing.T) {
	ch := makeChannel(4, `{"categories":["moda"]}`)
	product := ProductInput{Category: "eletronicos", Price: 500, Drop: 15}
	matchScore := ScoreChannel(product, ch, defaultWeights)
	// category mismatch → catScore=0
	if matchScore.Value >= 70 {
		t.Errorf("expected lower score for category mismatch, got %.0f", matchScore.Value)
	}
}

func TestScoreChannel_BrandMatch(t *testing.T) {
	ch := makeChannel(5, `{"brands":["samsung"]}`)
	productMatch := ProductInput{Brand: "samsung", Price: 500}
	productNoMatch := ProductInput{Brand: "lg", Price: 500}

	sMatch := ScoreChannel(productMatch, ch, defaultWeights)
	sNoMatch := ScoreChannel(productNoMatch, ch, defaultWeights)

	if sMatch.Value <= sNoMatch.Value {
		t.Errorf("brand match should score higher: match=%.0f, nomatch=%.0f", sMatch.Value, sNoMatch.Value)
	}
	found := false
	for _, r := range sMatch.Reasons {
		if r == "marca presente no perfil" {
			found = true
		}
	}
	if !found {
		t.Error("expected 'marca presente no perfil' reason for brand match")
	}
}

func TestScoreChannel_PriceOutOfBand(t *testing.T) {
	ch := makeChannel(6, `{"min_price":500,"max_price":1000}`)
	product := ProductInput{Price: 50, Category: "test", Drop: 0}
	score := ScoreChannel(product, ch, defaultWeights)
	// price muito abaixo do min → priceScore baixo
	// com price=50 e min=500, ramp = max(0, 1 - (500-50)/500) = max(0, 1 - 0.9) = 0.1
	if score.Value >= 80 {
		t.Errorf("expected lower score for price far below band, got %.0f", score.Value)
	}
}

func TestScoreChannel_PreservesChannelID(t *testing.T) {
	ch := makeChannel(42, `{}`)
	product := ProductInput{Category: "moda", Price: 200, Drop: 5}
	s := ScoreChannel(product, ch, defaultWeights)
	if s.ChannelID != 42 {
		t.Fatalf("ChannelID: got %d want 42 (auto-match falha se 0)", s.ChannelID)
	}
	if s.ChannelName != "ch" {
		t.Fatalf("ChannelName: got %q want ch", s.ChannelName)
	}
}

func TestRankChannels_OrderedDesc(t *testing.T) {
	ch1 := makeChannel(1, `{"categories":["eletronicos"],"min_drop":10}`)
	ch1.Name = "Eletronicos BR"
	ch2 := makeChannel(2, `{"categories":["moda"],"min_drop":30}`)
	ch2.Name = "Moda BR"
	product := ProductInput{Category: "eletronicos", Drop: 15}
	scores := RankChannels(product, []models.Channel{ch1, ch2})
	if len(scores) < 1 {
		t.Fatal("expected at least one score")
	}
	if scores[0].ChannelID != 1 {
		t.Errorf("expected ch1 first (eletronicos match), got ch%d", scores[0].ChannelID)
	}
	// verifica ordering
	for i := 0; i < len(scores)-1; i++ {
		if scores[i].Value < scores[i+1].Value {
			t.Errorf("scores not ordered desc at index %d: %.0f < %.0f", i, scores[i].Value, scores[i+1].Value)
		}
	}
}

func BenchmarkScoreChannel(b *testing.B) {
	ch := makeChannel(1, `{"categories":["eletronicos"],"brands":["samsung"],"min_drop":10,"min_price":100,"max_price":5000}`)
	product := ProductInput{Category: "eletronicos", Brand: "samsung", Price: 1500, Drop: 15}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ScoreChannel(product, ch, defaultWeights)
	}
}
