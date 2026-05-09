package affiliates

import "testing"

func TestValidCanonicalMarketplace(t *testing.T) {
	if !ValidCanonicalMarketplace("amz") || !ValidCanonicalMarketplace(MarketplaceAmazon) {
		t.Fatal("amazon aliases should validate")
	}
	if ValidCanonicalMarketplace("loja-xyz-999") {
		t.Fatal("unknown label should not validate")
	}
}

func TestMarketplaceCatalogCoversAllCanonicalIDs(t *testing.T) {
	cat := MarketplaceCatalog()
	if len(cat) != len(CanonicalMarketplaceIDs) {
		t.Fatalf("catalog len %d != canonical ids len %d", len(cat), len(CanonicalMarketplaceIDs))
	}
	seen := map[string]bool{}
	for _, def := range cat {
		if seen[def.ID] {
			t.Fatalf("duplicate id %q", def.ID)
		}
		seen[def.ID] = true
		if !IsCanonicalMarketplaceID(def.ID) {
			t.Fatalf("catalog id %q not in enum", def.ID)
		}
	}
}
