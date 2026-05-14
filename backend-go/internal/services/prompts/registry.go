package prompts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// Prompt representa um prompt versionado com metadados.
type Prompt struct {
	Operation   string
	Version     string
	Model       string
	MaxTokens   int
	Temperature float64
	Schema      json.RawMessage
	tmpl        *template.Template
}

// Render executa o template com os dados fornecidos.
func (p *Prompt) Render(data any) (string, error) {
	var buf bytes.Buffer
	if err := p.tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("render prompt %s/%s: %w", p.Operation, p.Version, err)
	}
	return buf.String(), nil
}

// Registry armazena todos os prompts carregados.
type Registry struct {
	prompts map[string]map[string]*Prompt // op -> version -> Prompt
}

// NewRegistry cria um registry com prompts embutidos em código (fallback para rootDir vazio).
func NewRegistry() *Registry {
	r := &Registry{prompts: make(map[string]map[string]*Prompt)}
	for _, embedded := range embeddedPrompts() {
		r.add(embedded)
	}
	return r
}

// Load carrega prompts de um diretório (op/vN.tmpl).
func Load(rootDir string) (*Registry, error) {
	r := NewRegistry() // começa com embutidos
	if rootDir == "" {
		return r, nil
	}
	entries, err := os.ReadDir(rootDir)
	if err != nil {
		if os.IsNotExist(err) {
			return r, nil
		}
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		op := entry.Name()
		opDir := filepath.Join(rootDir, op)
		files, _ := os.ReadDir(opDir)
		for _, f := range files {
			if f.IsDir() || !strings.HasSuffix(f.Name(), ".tmpl") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(opDir, f.Name()))
			if err != nil {
				continue
			}
			p, err := parsePromptFile(op, f.Name(), data)
			if err != nil {
				continue
			}
			r.add(p)
		}
	}
	return r, nil
}

func (r *Registry) add(p *Prompt) {
	if _, ok := r.prompts[p.Operation]; !ok {
		r.prompts[p.Operation] = make(map[string]*Prompt)
	}
	r.prompts[p.Operation][p.Version] = p
}

// Get retorna um prompt por operação e versão.
func (r *Registry) Get(op, version string) (*Prompt, error) {
	ops, ok := r.prompts[op]
	if !ok {
		return nil, fmt.Errorf("prompts: operation %q not found", op)
	}
	p, ok := ops[version]
	if !ok {
		return nil, fmt.Errorf("prompts: operation %q version %q not found", op, version)
	}
	return p, nil
}

// Active retorna a versão ativa de uma operação (via env LLM_PROMPT_VERSION_<OP> ou "v1").
func (r *Registry) Active(op string) (*Prompt, error) {
	envKey := "LLM_PROMPT_VERSION_" + strings.ToUpper(strings.ReplaceAll(op, ".", "_"))
	version := os.Getenv(envKey)
	if version == "" {
		version = "v1"
	}
	return r.Get(op, version)
}

// parsePromptFile analisa um arquivo .tmpl com frontmatter YAML simples (--- ... ---).
func parsePromptFile(op, filename string, data []byte) (*Prompt, error) {
	version := strings.TrimSuffix(filename, ".tmpl")
	content := string(data)

	p := &Prompt{
		Operation:   op,
		Version:     version,
		MaxTokens:   500,
		Temperature: 0.5,
	}

	// Parsear frontmatter simples (--- \n key: value \n ---)
	if strings.HasPrefix(content, "---") {
		parts := strings.SplitN(content, "---", 3)
		if len(parts) >= 3 {
			frontmatter := parts[1]
			body := strings.TrimSpace(parts[2])
			parseFrontmatter(p, frontmatter)
			content = body
		}
	}

	tmpl, err := template.New(op + "/" + version).Parse(content)
	if err != nil {
		return nil, fmt.Errorf("parse template %s/%s: %w", op, version, err)
	}
	p.tmpl = tmpl
	return p, nil
}

func parseFrontmatter(p *Prompt, fm string) {
	for _, line := range strings.Split(fm, "\n") {
		line = strings.TrimSpace(line)
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		switch key {
		case "model":
			p.Model = val
		case "max_tokens":
			fmt.Sscanf(val, "%d", &p.MaxTokens)
		case "temperature":
			fmt.Sscanf(val, "%f", &p.Temperature)
		case "output_schema":
			p.Schema = json.RawMessage(val)
		}
	}
}
