package scrapers

import (
	"encoding/json"

	"snatcher/backendv2/internal/models"
)

// crawlMetaBytes serializa CrawlMetadata para JSON armazenável em crawlresult/catalogvariant.
// Retorna nil se não houver conteúdo útil (evita sobrescrever com {} desnecessariamente no Item).
func crawlMetaBytes(m models.CrawlMetadata) []byte {
	b, err := json.Marshal(m)
	if err != nil || len(b) <= 2 {
		return nil
	}
	return b
}
