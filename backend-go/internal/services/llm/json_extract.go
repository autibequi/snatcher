package llm

// ExtractJSONObject removes marcadores comuns de markdown e devolve o último objeto JSON balanceado `{...}` em s.
// Usado quando modelos ignoram instruções e envolvem JSON em ``` ou texto extra.
func ExtractJSONObject(s string) string {
	return extractLastJSON(s)
}
