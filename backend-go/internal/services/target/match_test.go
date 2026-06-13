package target

import "testing"

func TestMatch(t *testing.T) {
	// Config base: categorias {1,2}, faixa 50–200.
	base := Config{
		Categories: []int64{1, 2},
		PriceMin:   50,
		PriceMax:   200,
	}

	cases := []struct {
		name      string
		product   Product
		cfg       Config
		wantMatch bool
	}{
		{
			name:      "categoria e preço dentro do alvo",
			product:   Product{CategoryID: 1, Price: 100, Title: "Notebook Dell"},
			cfg:       base,
			wantMatch: true,
		},
		{
			name:      "categoria fora do alvo",
			product:   Product{CategoryID: 9, Price: 100, Title: "Geladeira"},
			cfg:       base,
			wantMatch: false,
		},
		{
			name:      "preço abaixo do mínimo",
			product:   Product{CategoryID: 1, Price: 30, Title: "Cabo USB"},
			cfg:       base,
			wantMatch: false,
		},
		{
			name:      "preço acima do máximo",
			product:   Product{CategoryID: 2, Price: 999, Title: "TV 65"},
			cfg:       base,
			wantMatch: false,
		},
		{
			name:      "categorias vazias = qualquer categoria passa",
			product:   Product{CategoryID: 42, Price: 100, Title: "Qualquer"},
			cfg:       Config{PriceMin: 50, PriceMax: 200},
			wantMatch: true,
		},
		{
			name:      "PriceMax zero = sem teto",
			product:   Product{CategoryID: 1, Price: 100000, Title: "Servidor"},
			cfg:       Config{Categories: []int64{1}, PriceMin: 50},
			wantMatch: true,
		},
		{
			name:      "blacklist no título bloqueia",
			product:   Product{CategoryID: 1, Price: 100, Title: "Notebook RECONDICIONADO"},
			cfg:       Config{Categories: []int64{1}, PriceMin: 50, PriceMax: 200, Blacklist: []string{"recondicionado"}},
			wantMatch: false,
		},
		{
			name:      "whitelist anula a blacklist",
			product:   Product{CategoryID: 1, Price: 100, Title: "Notebook recondicionado PREMIUM"},
			cfg:       Config{Categories: []int64{1}, PriceMin: 50, PriceMax: 200, Blacklist: []string{"recondicionado"}, Whitelist: []string{"premium"}},
			wantMatch: true,
		},
		{
			name:      "whitelist NÃO anula categoria fora do alvo",
			product:   Product{CategoryID: 9, Price: 100, Title: "Geladeira premium"},
			cfg:       Config{Categories: []int64{1, 2}, PriceMin: 50, PriceMax: 200, Whitelist: []string{"premium"}},
			wantMatch: false,
		},
		{
			name:      "preço no limite inferior é incluído",
			product:   Product{CategoryID: 1, Price: 50, Title: "X"},
			cfg:       base,
			wantMatch: true,
		},
		{
			name:      "preço no limite superior é incluído",
			product:   Product{CategoryID: 1, Price: 200, Title: "Y"},
			cfg:       base,
			wantMatch: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, reason := Match(tc.product, tc.cfg)
			if got != tc.wantMatch {
				t.Errorf("Match() = %v (reason=%q), quer %v", got, reason, tc.wantMatch)
			}
			if reason == "" {
				t.Errorf("Match() reason vazio — sempre deve explicar a decisão")
			}
		})
	}
}
