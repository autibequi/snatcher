package affiliates

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"snatcher/backendv2/internal/models"
)

// BuildLink constrói o link de afiliado para um produto dado uma lista de programas ativos.
// Retorna o URL com o tag/ID do programa de maior prioridade que cobre o marketplace.
// Determinístico: mesma entrada → mesma saída.
func BuildLink(productURL, marketplace string, programs []models.AffiliateProgram) (affiliateURL, programName string, err error) {
	// Filtrar por marketplace
	var candidates []models.AffiliateProgram
	for _, p := range programs {
		if strings.EqualFold(p.Marketplace, marketplace) {
			candidates = append(candidates, p)
		}
	}
	if len(candidates) == 0 {
		return productURL, "", nil // sem afiliado, retorna URL original
	}

	// Ordenar por priority nas rules (maior primeiro)
	sort.Slice(candidates, func(i, j int) bool {
		pi := extractPriority(candidates[i].Rules)
		pj := extractPriority(candidates[j].Rules)
		return pi > pj
	})

	best := candidates[0]
	var creds map[string]string
	_ = json.Unmarshal(best.Credentials, &creds)

	switch strings.ToLower(marketplace) {
	case "amazon":
		tag := creds["tag"]
		if tag == "" {
			return productURL, best.Name, nil
		}
		u, parseErr := url.Parse(productURL)
		if parseErr != nil {
			return productURL, best.Name, nil
		}
		q := u.Query()
		q.Set("tag", tag)
		u.RawQuery = q.Encode()
		return u.String(), best.Name, nil

	case "mercadolivre":
		affiliateID := creds["affiliate_id"]
		if affiliateID == "" {
			return productURL, best.Name, nil
		}
		return fmt.Sprintf("https://click.mlcdn.com.br/LP/PT/X/%s/PN%s", affiliateID, url.QueryEscape(productURL)), best.Name, nil

	default:
		// Genérico: adicionar affiliate_id como query param
		affiliateID := creds["affiliate_id"]
		if affiliateID == "" {
			return productURL, best.Name, nil
		}
		separator := "?"
		if strings.Contains(productURL, "?") {
			separator = "&"
		}
		return productURL + separator + "aff=" + url.QueryEscape(affiliateID), best.Name, nil
	}
}

func extractPriority(rules []byte) int {
	if len(rules) == 0 {
		return 0
	}
	var r struct {
		Priority int `json:"priority"`
	}
	_ = json.Unmarshal(rules, &r)
	return r.Priority
}
