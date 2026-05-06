package pipeline

import (
	"reflect"
	"sort"
	"testing"
)

func TestMatchCategories(t *testing.T) {
	cases := []struct {
		title string
		want  []string
	}{
		{"RTX 4070 Super", []string{"hardware"}},
		{"Whey Protein 900g Integralmedica", []string{"suplementos"}},
		{"Tênis Nike Air Max", []string{"moda"}},
		{"iPhone 15 Pro", []string{"smartphones"}},
		{"Ração Premium para Cachorro", []string{"pet"}},
		{"Caixa de Fralda Pampers Premium Care", []string{"bebes"}},
		{"Smart TV LG 50 polegadas", []string{"eletrodomesticos"}},
		{"Produto sem categoria reconhecível xpto", nil},
	}
	for _, c := range cases {
		t.Run(c.title, func(t *testing.T) {
			got := MatchCategories(c.title)
			sort.Strings(got)
			sort.Strings(c.want)
			if len(got) == 0 && len(c.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("MatchCategories(%q) = %v, want %v", c.title, got, c.want)
			}
		})
	}
}

func TestEnrichTags(t *testing.T) {
	got := EnrichTags("Whey 900g Integralmedica", []string{"manual-tag"})
	want := []string{"manual-tag", "suplementos"}
	sort.Strings(got)
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("EnrichTags = %v, want %v", got, want)
	}
}
