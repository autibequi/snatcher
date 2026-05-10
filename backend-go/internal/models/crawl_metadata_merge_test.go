package models

import (
	"encoding/json"
	"testing"
)

func TestMergeCrawlMetadataJSON(t *testing.T) {
	base := CrawlMetadata{
		Description: "old desc",
		Rating:      4.5,
	}
	baseJSON, _ := json.Marshal(base)
	inc := CrawlMetadata{
		Brand:        "Samsung",
		SpecsSummary: "128 GB",
		Description:  "", // não deve apagar descrição antiga
	}
	incJSON, _ := json.Marshal(inc)

	out := MergeCrawlMetadataJSON(baseJSON, incJSON)
	var got CrawlMetadata
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatal(err)
	}
	if got.Description != "old desc" {
		t.Fatalf("description: want old preserved, got %q", got.Description)
	}
	if got.Brand != "Samsung" || got.SpecsSummary != "128 GB" {
		t.Fatalf("brand/specs: %+v", got)
	}
	if got.Rating != 4.5 {
		t.Fatalf("rating dropped: %v", got.Rating)
	}
}
