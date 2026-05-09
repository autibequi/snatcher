package invitelinks

import "strings"

// NormalizeWhatsAppInvite devolve sempre um URL https://chat.whatsapp.com/<código>
// quando o valor parece só o código ou URL sem scheme.
func NormalizeWhatsAppInvite(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	low := strings.ToLower(s)
	if strings.HasPrefix(low, "http://") || strings.HasPrefix(low, "https://") {
		return s
	}
	if strings.HasPrefix(low, "//") {
		return "https:" + s
	}

	if i := strings.Index(low, "chat.whatsapp.com/"); i >= 0 {
		rest := strings.TrimSpace(s[i+len("chat.whatsapp.com/"):])
		rest = strings.TrimPrefix(rest, "invite/")
		rest = strings.TrimPrefix(rest, "c/")
		if idx := strings.Index(rest, "?"); idx >= 0 {
			rest = rest[:idx]
		}
		if rest != "" {
			return "https://chat.whatsapp.com/" + rest
		}
		return s
	}

	allowed := func(r rune) bool {
		return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_'
	}
	ok := len(s) >= 10 && len(s) <= 512
	for _, r := range s {
		if !allowed(r) {
			ok = false
			break
		}
	}
	if ok && !strings.Contains(s, "/") && !strings.Contains(s, ":") && !strings.Contains(s, " ") {
		return "https://chat.whatsapp.com/" + s
	}
	return s
}
