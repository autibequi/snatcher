package affiliates

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"snatcher/backendv2/internal/models"
)

// ErrNoAffiliate é retornado quando nenhum programa de afiliado cobre o marketplace
// ou quando o programa encontrado não tem credenciais configuradas.
var ErrNoAffiliate = errors.New("nenhum código de afiliado configurado para este marketplace")

// HasAffiliate verifica se há programa ativo com credenciais para o marketplace.
// Retorna true só quando o link seria efetivamente reescrito com tag/affiliate_id.
func HasAffiliate(marketplace string, programs []models.AffiliateProgram) bool {
	want := CanonicalAffiliateMarketplace(marketplace)
	for _, p := range programs {
		if !p.Active {
			continue
		}
		if CanonicalAffiliateMarketplace(p.Marketplace) != want {
			continue
		}
		var creds map[string]string
		_ = json.Unmarshal(p.Credentials, &creds)
		switch want {
		case MarketplaceAmazon:
			if creds["tag"] != "" {
				return true
			}
		case MarketplaceMercadoLivre:
			if creds["affiliate_id"] != "" {
				return true
			}
		default:
			if creds["affiliate_id"] != "" {
				return true
			}
		}
	}
	return false
}

// BuildLinkStrict retorna ErrNoAffiliate quando nenhum programa cobre o marketplace
// com credenciais válidas. Use quando a presença de afiliado é mandatória.
func BuildLinkStrict(productURL, marketplace string, programs []models.AffiliateProgram) (string, string, error) {
	if !HasAffiliate(marketplace, programs) {
		return productURL, "", ErrNoAffiliate
	}
	return BuildLink(productURL, marketplace, programs)
}

// BuildLink constrói o link de afiliado para um produto dado uma lista de programas ativos.
// Retorna o URL com o tag/ID do programa de maior prioridade que cobre o marketplace.
// Determinístico: mesma entrada → mesma saída.
func BuildLink(productURL, marketplace string, programs []models.AffiliateProgram) (affiliateURL, programName string, err error) {
	want := CanonicalAffiliateMarketplace(marketplace)
	// Filtrar por marketplace (canonical)
	var candidates []models.AffiliateProgram
	for _, p := range programs {
		if !p.Active {
			continue
		}
		if CanonicalAffiliateMarketplace(p.Marketplace) != want {
			continue
		}
		candidates = append(candidates, p)
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

	switch want {
	case MarketplaceAmazon:
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

	case MarketplaceMercadoLivre:
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

// DestinationLooksAffiliateReady indica se destURL já contém rastreamento aplicado por BuildLink
// (tag Amazon, wrapper ML ou aff= genérico). Nesse caso redirects não devem sobrescrever com a tabela legada affiliates.
func DestinationLooksAffiliateReady(destURL, marketplace string) bool {
	want := CanonicalAffiliateMarketplace(marketplace)
	u, err := url.Parse(destURL)
	if err != nil {
		return false
	}

	switch want {
	case MarketplaceAmazon:
		return u.Query().Get("tag") != ""
	case MarketplaceMercadoLivre:
		if strings.Contains(strings.ToLower(destURL), "click.mlcdn.com.br") {
			return true
		}
		return strings.Contains(destURL, "matt_tool=")
	default:
		return u.Query().Get("aff") != ""
	}
}
