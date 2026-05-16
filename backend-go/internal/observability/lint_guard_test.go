package observability

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestMythosNotInLogs garante que persona mythos não vaze pra log structured
// ou metric names (invariante I13 do refactor V3).
// Palavras mythos são permitidas apenas em copy de UI (frontend/).
func TestMythosNotInLogs(t *testing.T) {
	// forbidden lista os termos que sinalizam tom mythos — não devem aparecer
	// dentro de chamadas slog estruturadas em arquivos Go de backend.
	forbidden := []string{
		"mythos",
		"ômega",
		"alpha kai to",
		"corrente quebrou",
		"pulso da máquina",
	}

	// forbiddenRe detecta chamadas slog com qualquer termo mythos no argumento de mensagem.
	forbiddenRe := regexp.MustCompile(
		`(?i)slog\.(Error|Warn|Info|Debug)\([^)]*"[^"]*(` + strings.Join(forbidden, "|") + `)`,
	)

	// root aponta para a raiz do módulo backend-go a partir deste pacote.
	root := "../../"

	walkErr := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		// Pular diretórios de dependências e controle de versão.
		if entry.IsDir() {
			dirName := entry.Name()
			if dirName == "vendor" || dirName == "node_modules" || dirName == ".git" {
				return filepath.SkipDir
			}
			return nil
		}

		// Processar apenas arquivos .go de produção (não _test.go).
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		data, readErr := os.ReadFile(path)
		if readErr != nil {
			// Arquivo ilegível — ignorar silenciosamente para não bloquear CI por permissão.
			return nil
		}

		if forbiddenRe.Match(data) {
			t.Errorf("persona mythos vazou pra log structured em %s", path)
		}

		return nil
	})

	if walkErr != nil {
		t.Fatal(walkErr)
	}
}
