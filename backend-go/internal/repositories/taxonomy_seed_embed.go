package repositories

import (
	"strings"

	_ "embed"
)

// Trecho SEED DATA da migração 0112 (INSERTs idempotentes com ON CONFLICT).
//
//go:embed taxonomy_seed_data.sql
var taxonomySeedDataSQL string

// splitTaxonomySeedStatements separa o ficheiro embutido em sentenças INSERT (multi-linha).
func splitTaxonomySeedStatements(seed string) []string {
	lines := strings.Split(seed, "\n")
	var out []string
	var buf []string
	flush := func() {
		if len(buf) == 0 {
			return
		}
		stmt := strings.TrimSpace(strings.Join(buf, "\n"))
		buf = buf[:0]
		if stmt == "" || !strings.Contains(stmt, "INSERT INTO") {
			return
		}
		out = append(out, stmt)
	}
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" && len(buf) == 0 {
			continue
		}
		if strings.HasPrefix(t, "--") && len(buf) == 0 {
			continue
		}
		buf = append(buf, line)
		trimmedRight := strings.TrimRight(line, " \t")
		if strings.HasSuffix(trimmedRight, ";") {
			flush()
		}
	}
	return out
}
