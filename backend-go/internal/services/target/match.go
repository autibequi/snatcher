// Package target implementa o matching determinístico produto → público-alvo do canal.
//
// Substitui a seleção por bandit/learned_weights (removida na W1). A regra é simples e
// auditável (ver reavaliação 2026-06-13): um produto casa com o alvo quando sua categoria
// está entre as categorias do canal, seu preço está na faixa configurada, e ele não está
// na blacklist (a menos que esteja na whitelist, que anula a blacklist).
package target

import "strings"

// Product é a visão mínima de um item de catálogo para o matching.
type Product struct {
	CategoryID int64
	Price      float64
	Title      string
}

// Config é o público-alvo de um canal: categorias, faixa de preço e black/whitelist.
// Categorias vazias = qualquer categoria. PriceMax == 0 = sem teto.
// Black/whitelist casam por substring case-insensitive no título do produto.
type Config struct {
	Categories []int64
	PriceMin   float64
	PriceMax   float64
	Blacklist  []string
	Whitelist  []string
}

// Match decide se o produto casa com o alvo e devolve o motivo da decisão.
// Ordem de avaliação: categoria → faixa de preço → blacklist (anulável por whitelist).
func Match(p Product, c Config) (bool, string) {
	if len(c.Categories) > 0 && !containsInt64(c.Categories, p.CategoryID) {
		return false, "categoria fora do alvo"
	}
	if p.Price < c.PriceMin {
		return false, "preço abaixo do mínimo"
	}
	if c.PriceMax > 0 && p.Price > c.PriceMax {
		return false, "preço acima do máximo"
	}
	if term, hit := matchTerm(p.Title, c.Blacklist); hit {
		if wterm, white := matchTerm(p.Title, c.Whitelist); white {
			return true, "ok (whitelist: " + wterm + " anula blacklist)"
		}
		return false, "blacklist: " + term
	}
	if wterm, white := matchTerm(p.Title, c.Whitelist); white {
		return true, "ok (whitelist: " + wterm + ")"
	}
	return true, "ok"
}

// matchTerm devolve o primeiro termo da lista contido no título (case-insensitive).
func matchTerm(title string, terms []string) (string, bool) {
	lower := strings.ToLower(title)
	for _, term := range terms {
		t := strings.ToLower(strings.TrimSpace(term))
		if t == "" {
			continue
		}
		if strings.Contains(lower, t) {
			return term, true
		}
	}
	return "", false
}

func containsInt64(haystack []int64, needle int64) bool {
	for _, v := range haystack {
		if v == needle {
			return true
		}
	}
	return false
}
