package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"
	appdb "snatcher/backendv2/internal/db"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://snatcher:devpass@localhost:5433/snatcher?sslmode=disable"
	}
	email := os.Getenv("SEED_ADMIN_EMAIL")
	if email == "" {
		email = "admin@snatcher.local"
	}
	password := os.Getenv("SEED_ADMIN_PASSWORD")
	if password == "" {
		password = "changeme"
	}

	db, err := appdb.Open(dsn)
	if err != nil {
		log.Fatal("open db:", err)
	}
	defer db.Close()
	if err := appdb.RunMigrations(db); err != nil {
		log.Fatal("migrations:", err)
	}
	// Nota: seeds de categories, modems, llm_autonomy, tunable_parameters, templates e alert_rules
	// estão incorporados nas migrations 20260513100001–20260513100016. Nenhum seed adicional
	// precisa ser chamado manualmente aqui — as migrations são idempotentes (ON CONFLICT DO NOTHING).

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(
		`INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Admin', 'admin')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
		email, string(hash))
	if err != nil {
		log.Fatal("insert user:", err)
	}
	fmt.Printf("Admin criado: %s\n", email)
}
