package senders

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

// Emit insere evento no outbox_events DENTRO de uma TX existente.
// Caller é responsável pelo commit.
func Emit(ctx context.Context, tx *sqlx.Tx, aggregateID, eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO outbox_events (aggregate_id, event_type, payload) VALUES ($1, $2, $3::jsonb)`,
		aggregateID, eventType, string(raw))
	return err
}

// ─── Outbox Pattern W1 ────────────────────────────────────────────────────────
//
// OutboxEntry representa os dados necessários para enfileirar um envio no
// dispatcher V3. É a unidade atômica do outbox pattern: toda inserção em
// send_queue deve ser acompanhada de um update em catalog.catalog_status,
// tudo dentro da mesma TX.
//
// Mapeamento para send_queue:
//   CatalogItemID → catalog_id
//   ModemID       → modem_id
//   Recipient     → group_id lookup pelo caller; aqui é string para validação
//   Message       → armazenado em send_queue via message_override (nullable)
//   RoutingKey    → routing_key
//   Priority      → score (normalizado 0–1 pelo caller)

// recipientRE aceita JID WhatsApp (ex: "5511999999999@g.us") ou ID numérico inteiro.
var recipientRE = regexp.MustCompile(`^(\d{5,20}@\S+|\d+)$`)

// maxMessageLen é o limite máximo de caracteres de uma mensagem.
const maxMessageLen = 4096

// OutboxEntry é o payload de entrada do outbox pattern.
type OutboxEntry struct {
	// CatalogItemID é o ID do produto em catalog.id.
	CatalogItemID int64
	// ModemID é o modem que realizará o envio.
	ModemID int64
	// Recipient identifica o destino: JID WhatsApp (ex: "5511@g.us") ou group_id como string.
	Recipient string
	// Message é o texto pré-renderizado que será enviado (message_override em send_queue).
	// Pode ser vazio quando o envio usa template (catalog flow).
	Message string
	// RoutingKey é a chave de afinidade de domínio resolvida pelo router (send_queue.routing_key).
	RoutingKey string
	// Priority indica a prioridade de despacho; mapeia para send_queue.score (0–1).
	Priority int
}

// validateForDispatch verifica que OutboxEntry tem todos os campos obrigatórios
// e que os valores estão dentro dos limites aceitos.
// Retorna erro descritivo por campo — caller pode logar ou encaminhar ao usuário.
func validateForDispatch(entry OutboxEntry) error {
	var errs []string

	if entry.CatalogItemID <= 0 {
		errs = append(errs, "CatalogItemID: obrigatório e deve ser > 0")
	}
	if entry.ModemID <= 0 {
		errs = append(errs, "ModemID: obrigatório e deve ser > 0")
	}
	if strings.TrimSpace(entry.Recipient) == "" {
		errs = append(errs, "Recipient: obrigatório")
	} else if !recipientRE.MatchString(strings.TrimSpace(entry.Recipient)) {
		errs = append(errs, fmt.Sprintf("Recipient: formato inválido %q — esperado JID (ex: 5511999@g.us) ou ID numérico", entry.Recipient))
	}
	if len(entry.Message) > maxMessageLen {
		errs = append(errs, fmt.Sprintf("Message: excede limite de %d caracteres (atual: %d)", maxMessageLen, len(entry.Message)))
	}
	if entry.Priority < 0 {
		errs = append(errs, "Priority: não pode ser negativo")
	}

	if len(errs) > 0 {
		return fmt.Errorf("validateForDispatch: %s", strings.Join(errs, "; "))
	}
	return nil
}

// InsertOutbox enfileira um item em send_queue e atualiza catalog.catalog_status → 'sent'
// (valor do enum catalog_status_t, W2.A) DENTRO da transação TX recebida.
// Caller controla BEGIN/COMMIT/ROLLBACK.
//
// Anti-pattern explícito: InsertOutbox NUNCA cria transação própria.
// Se o caller faz rollback após InsertOutbox, nenhuma das duas operações persiste.
//
// Idempotência: INSERT usa ON CONFLICT DO NOTHING (baseado em unique index
// que será criado em W2.A sobre catalog_id+modem_id).
func InsertOutbox(ctx context.Context, tx *sql.Tx, entry OutboxEntry) error {
	if err := validateForDispatch(entry); err != nil {
		return err
	}

	// Normaliza message_override: NULL quando vazio (catalog flow usa template).
	var msgOverride sql.NullString
	if strings.TrimSpace(entry.Message) != "" {
		msgOverride = sql.NullString{String: entry.Message, Valid: true}
	}

	// Normaliza routing_key: NULL quando vazio.
	var routingKey sql.NullString
	if strings.TrimSpace(entry.RoutingKey) != "" {
		routingKey = sql.NullString{String: entry.RoutingKey, Valid: true}
	}

	// Normaliza score a partir de Priority: 0–100 → 0.0–1.0.
	score := float64(entry.Priority) / 100.0
	if score > 1.0 {
		score = 1.0
	}

	// 1. Inserir em send_queue (idempotente via ON CONFLICT DO NOTHING).
	//    Recipient é tratado como group_id (string numérica); conversão via CAST.
	_, err := tx.ExecContext(ctx, `
		INSERT INTO send_queue (catalog_id, modem_id, group_id, message_override, routing_key, score, status, enqueued_at)
		VALUES ($1, $2, CAST($3 AS BIGINT), $4, $5, $6, 'pending', $7)
		ON CONFLICT DO NOTHING
	`,
		entry.CatalogItemID,
		entry.ModemID,
		entry.Recipient,
		msgOverride,
		routingKey,
		score,
		time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("InsertOutbox: insert send_queue: %w", err)
	}

	// 2. Marcar catalog_status → 'sent' quando enfileirado para dispatch.
	//    Usa valor 'sent' do enum catalog_status_t (W2.A). O UPDATE é no-op se
	//    catalog_status já está em 'sent' (proteção contra dupla chamada).
	_, err = tx.ExecContext(ctx, `
		UPDATE catalog
		SET catalog_status = 'sent'
		WHERE id = $1
		  AND catalog_status IN ('pending', 'enriching', 'ready')
	`, entry.CatalogItemID)
	if err != nil {
		return fmt.Errorf("InsertOutbox: update catalog_status: %w", err)
	}

	return nil
}

// ─── OutboxWriter ─────────────────────────────────────────────────────────────

// OutboxWriter é um wrapper que gerencia o ciclo de vida da transação.
// Use quando o caller não controla a TX diretamente (ex: scripts de backfill, workers simples).
// Para callers que já têm TX (ex: dispatcher.claimNextJob), prefira InsertOutbox diretamente.
type OutboxWriter struct {
	db *sql.DB
}

// NewOutboxWriter cria um OutboxWriter a partir de *sql.DB.
func NewOutboxWriter(db *sql.DB) *OutboxWriter {
	return &OutboxWriter{db: db}
}

// WriteWithTx abre uma nova transação, chama InsertOutbox e commita.
// Em qualquer erro — validação, INSERT ou UPDATE — faz rollback e retorna o erro.
func (w *OutboxWriter) WriteWithTx(ctx context.Context, entry OutboxEntry) error {
	tx, err := w.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("OutboxWriter.WriteWithTx: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if err := InsertOutbox(ctx, tx, entry); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("OutboxWriter.WriteWithTx: commit: %w", err)
	}
	return nil
}

// Sentinel para testes: verificar que o pacote não importa erros externos desnecessários.
var _ = errors.New
