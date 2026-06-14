package senders

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	// modernc.org/sqlite é o driver SQLite puro-Go disponível no projeto.
	// Usado aqui como banco em memória para testar a lógica transacional do outbox
	// sem exigir PostgreSQL em CI.
	_ "modernc.org/sqlite"
)

// setupOutboxDB cria um banco SQLite em memória com as tabelas mínimas necessárias
// para testar InsertOutbox: send_queue e catalog com catalog_status.
func setupOutboxDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("setupOutboxDB: open: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	schema := `
		CREATE TABLE IF NOT EXISTS catalog (
			id             INTEGER PRIMARY KEY,
			catalog_status TEXT
		);

		CREATE TABLE IF NOT EXISTS send_queue (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			catalog_id       INTEGER NOT NULL,
			modem_id         INTEGER NOT NULL,
			group_id         INTEGER NOT NULL,
			message_override TEXT,
			routing_key      TEXT,
			score            REAL    NOT NULL DEFAULT 0,
			status           TEXT    NOT NULL DEFAULT 'pending',
			enqueued_at      TEXT    NOT NULL
		);
	`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("setupOutboxDB: schema: %v", err)
	}
	return db
}

// seedCatalog insere um produto com o status informado.
func seedCatalog(t *testing.T, db *sql.DB, id int64, status string) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO catalog (id, catalog_status) VALUES (?, ?)`, id, status)
	if err != nil {
		t.Fatalf("seedCatalog: %v", err)
	}
}

// TestOutbox_HappyPath verifica que InsertOutbox em TX commitada persiste ambas as operações:
// row em send_queue e catalog_status atualizado para 'sent' (enum catalog_status_t, W2.A).
func TestOutbox_HappyPath(t *testing.T) {
	db := setupOutboxDB(t)
	seedCatalog(t, db, 42, "ready")

	entry := OutboxEntry{
		CatalogItemID: 42,
		ModemID:       7,
		Recipient:     "1234567890",
		RoutingKey:    "br-sp",
		Priority:      80,
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}

	if err := InsertOutbox(context.Background(), tx, entry); err != nil {
		tx.Rollback()
		t.Fatalf("InsertOutbox: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	// Verifica row em send_queue.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM send_queue WHERE catalog_id=42 AND modem_id=7 AND status='pending'`).Scan(&count); err != nil {
		t.Fatalf("query send_queue: %v", err)
	}
	if count != 1 {
		t.Errorf("send_queue: esperava 1 row, got %d", count)
	}

	// Verifica catalog_status.
	var status string
	if err := db.QueryRow(`SELECT catalog_status FROM catalog WHERE id=42`).Scan(&status); err != nil {
		t.Fatalf("query catalog: %v", err)
	}
	if status != "sent" {
		t.Errorf("catalog_status: esperava 'sent', got %q", status)
	}

	// Verifica score normalizado: Priority 80 → score 0.80.
	var score float64
	if err := db.QueryRow(`SELECT score FROM send_queue WHERE catalog_id=42`).Scan(&score); err != nil {
		t.Fatalf("query score: %v", err)
	}
	if score < 0.79 || score > 0.81 {
		t.Errorf("score: esperava ~0.80, got %f", score)
	}
}

// TestOutbox_ValidationFail verifica que validateForDispatch rejeita entry inválida
// antes de qualquer operação no banco — sem insert, sem update.
func TestOutbox_ValidationFail(t *testing.T) {
	db := setupOutboxDB(t)
	seedCatalog(t, db, 10, "ready")

	cases := []struct {
		name  string
		entry OutboxEntry
		want  string
	}{
		{
			name:  "catalog_id_zero",
			entry: OutboxEntry{CatalogItemID: 0, ModemID: 1, Recipient: "999"},
			want:  "CatalogItemID",
		},
		{
			name:  "modem_id_zero",
			entry: OutboxEntry{CatalogItemID: 10, ModemID: 0, Recipient: "999"},
			want:  "ModemID",
		},
		{
			name:  "recipient_empty",
			entry: OutboxEntry{CatalogItemID: 10, ModemID: 1, Recipient: ""},
			want:  "Recipient",
		},
		{
			name:  "recipient_invalid_format",
			entry: OutboxEntry{CatalogItemID: 10, ModemID: 1, Recipient: "não-um-jid"},
			want:  "Recipient",
		},
		{
			name:  "priority_negative",
			entry: OutboxEntry{CatalogItemID: 10, ModemID: 1, Recipient: "999", Priority: -1},
			want:  "Priority",
		},
		{
			name:  "message_too_long",
			entry: OutboxEntry{CatalogItemID: 10, ModemID: 1, Recipient: "999", Message: strings.Repeat("x", maxMessageLen+1)},
			want:  "Message",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tx, _ := db.BeginTx(context.Background(), nil)
			defer tx.Rollback()

			err := InsertOutbox(context.Background(), tx, tc.entry)
			if err == nil {
				t.Fatalf("esperava erro para %s, got nil", tc.name)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("erro %q não menciona %q", err.Error(), tc.want)
			}

			// Nenhum insert deve ter ocorrido.
			var count int
			_ = db.QueryRow(`SELECT COUNT(*) FROM send_queue`).Scan(&count)
			if count != 0 {
				t.Errorf("send_queue não deveria ter rows após validação falhar, got %d", count)
			}
		})
	}
}

// TestOutbox_RollbackIsolation verifica que quando a TX é revertida após InsertOutbox,
// nenhuma das duas operações (send_queue insert e catalog_status update) persiste.
func TestOutbox_RollbackIsolation(t *testing.T) {
	db := setupOutboxDB(t)
	seedCatalog(t, db, 99, "enriching")

	entry := OutboxEntry{
		CatalogItemID: 99,
		ModemID:       3,
		Recipient:     "5511999990000@g.us",
		Priority:      50,
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}

	if err := InsertOutbox(context.Background(), tx, entry); err != nil {
		tx.Rollback()
		t.Fatalf("InsertOutbox: %v", err)
	}

	// Rollback deliberado — simula falha após InsertOutbox mas antes do commit.
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// send_queue não deve ter nada.
	var sqCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM send_queue`).Scan(&sqCount); err != nil {
		t.Fatalf("query send_queue: %v", err)
	}
	if sqCount != 0 {
		t.Errorf("send_queue: após rollback esperava 0 rows, got %d", sqCount)
	}

	// catalog_status deve permanecer 'enriching'.
	var status string
	if err := db.QueryRow(`SELECT catalog_status FROM catalog WHERE id=99`).Scan(&status); err != nil {
		t.Fatalf("query catalog: %v", err)
	}
	if status != "enriching" {
		t.Errorf("catalog_status: após rollback esperava 'enriching', got %q", status)
	}
}
