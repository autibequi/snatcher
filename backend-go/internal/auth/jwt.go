package auth

import (
	"crypto/sha256"
	"fmt"
)

// SHA256Hex retorna o hash SHA-256 de s em hexadecimal.
func SHA256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h)
}
