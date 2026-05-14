package pipeline

import (
	"sort"
	"strings"
)

// CategoryMap mapeia categoria canônica → keywords detectáveis em títulos.
// Ordem das categorias e keywords não importa (matching é case-insensitive + sem acento).
var CategoryMap = map[string][]string{
	"hardware": {"placa de video", "placa de vídeo", "rtx", "gtx", "ssd", "placa mae", "placa mãe", "ryzen", "intel core", "cpu"},
	"smartphones": {"smartphone", "celular", "iphone", "samsung galaxy", "xiaomi redmi", "motorola moto"},
	"casa-cozinha": {"panela", "fogao", "fogão", "geladeira", "micro-ondas", "microondas", "liquidificador", "airfryer", "air fryer"},
	"bebes": {"fralda", "pampers", "lenco umedecido", "lenço umedecido", "papinha", "carrinho de bebe", "carrinho de bebê", "berco", "berço"},
	"suplementos": {"whey", "creatina", "bcaa", "termogenico", "termogênico", "vitamina", "proteina", "proteína", "hipercalorico", "hipercalórico"},
	"moda": {"tenis", "tênis", "camiseta", "calca jeans", "calça jeans", "vestido", "nike", "adidas"},
	"pet": {"racao", "ração", "petisco", "coleira", "areia para gato", "racao para cachorro"},
	"ferramentas": {"furadeira", "parafusadeira", "serra", "martelo", "chave de fenda", "alicate"},
	"eletrodomesticos": {"smart tv", "ar condicionado", "ventilador", "maquina de lavar", "máquina de lavar"},
	"livros": {"livro", "ebook", "kindle"},
}

// MatchCategories percorre o título e retorna as categorias canônicas que tiveram match.
// Case-insensitive, sem acento. Resultado ordenado para previsibilidade.
func MatchCategories(title string) []string {
	if title == "" {
		return nil
	}
	norm := strings.ToLower(Deaccent(title))
	seen := map[string]bool{}
	for cat, keywords := range CategoryMap {
		for _, kw := range keywords {
			kwNorm := strings.ToLower(Deaccent(kw))
			if MatchesWordBoundary(norm, kwNorm) {
				seen[cat] = true
				break
			}
		}
	}
	out := make([]string, 0, len(seen))
	for cat := range seen {
		out = append(out, cat)
	}
	sort.Strings(out)
	return out
}
