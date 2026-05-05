package auth

import "golang.org/x/crypto/bcrypt"

const BcryptCost = 12

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	return string(b), err
}

func CheckPassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
