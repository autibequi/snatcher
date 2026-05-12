package senders

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunSender é a goroutine principal do sender de 1 modem.
// Drena send_queue WHERE modem_id=X com FOR UPDATE SKIP LOCKED.
func RunSender(ctx context.Context, db *sqlx.DB, modemID int64) {
	slog.Info("sender.start", "modem", modemID)
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// gate global: flag use_send_queue
		var flag float64
		if err := db.GetContext(ctx, &flag, "SELECT get_param('use_send_queue','global',NULL)"); err != nil || flag == 0 {
			time.Sleep(30 * time.Second)
			continue
		}

		// gate: modem status
		var status string
		if err := db.GetContext(ctx, &status, "SELECT status FROM modems WHERE id=$1", modemID); err == nil && status != "active" {
			time.Sleep(60 * time.Second)
			continue
		}

		// gate: janela 21h-6h SP — defesa em profundidade
		if !inSendWindow() {
			time.Sleep(2 * time.Minute)
			continue
		}

		sent, err := drainOne(ctx, db, modemID)
		if err != nil {
			slog.Error("sender.drain", "err", err, "modem", modemID)
			time.Sleep(10 * time.Second)
			continue
		}
		if !sent {
			time.Sleep(15 * time.Second)
			continue
		}

		// cooldown 90s ±30s
		cooldown := getCooldownSeconds(ctx, db, modemID)
		jitter := time.Duration(rand.Intn(60)-30) * time.Second
		time.Sleep(time.Duration(cooldown)*time.Second + jitter)
	}
}

func drainOne(ctx context.Context, db *sqlx.DB, modemID int64) (bool, error) {
	// FOR UPDATE SKIP LOCKED — pega 1 pending
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback() //nolint:errcheck

	var qid, groupID, catalogID int64
	var accountID, templateID, domainID *int64
	err = tx.QueryRowxContext(ctx, `
		SELECT id, group_id, catalog_id, account_id, template_id, domain_id
		FROM send_queue
		WHERE modem_id=$1 AND status='pending'
		ORDER BY enqueued_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`, modemID).Scan(&qid, &groupID, &catalogID, &accountID, &templateID, &domainID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	// marca sending
	if _, err := tx.ExecContext(ctx, "UPDATE send_queue SET status='sending', attempts=attempts+1 WHERE id=$1", qid); err != nil {
		return false, err
	}

	// resolve account se vazio: round-robin entre primary/backup do modem que tem permissão no grupo
	if accountID == nil {
		var a int64
		err := tx.GetContext(ctx, &a, `
			SELECT a.id FROM accounts a
			JOIN group_admins ga ON ga.account_id=a.id AND ga.account_type='wa'
			WHERE a.modem_id=$1 AND a.status IN ('primary','backup') AND ga.group_id=$2
			ORDER BY a.last_sent_at ASC NULLS FIRST
			LIMIT 1
		`, modemID, groupID)
		if err != nil {
			_, _ = tx.ExecContext(ctx, "UPDATE send_queue SET status='failed' WHERE id=$1", qid)
			_ = tx.Commit()
			return true, fmt.Errorf("no account available for group %d", groupID)
		}
		accountID = &a
	}

	// resolve template se vazio: weighted random por categoria do grupo
	if templateID == nil {
		var t int64
		if err := tx.GetContext(ctx, &t, `
			SELECT t.id FROM templates t
			JOIN groups g ON g.id=$1
			WHERE t.category_id = g.category_id AND t.enabled=true
			ORDER BY random() * t.weight DESC LIMIT 1
		`, groupID); err == nil {
			templateID = &t
		}
	}

	// resolve domínio se vazio: afinidade modem→domínio com fallback pool
	if domainID == nil {
		var d int64
		if err := tx.GetContext(ctx, &d, `
			SELECT id FROM redirect_domains
			WHERE enabled=true AND (modem_id=$1 OR modem_id IS NULL)
			  AND (quarantine_until IS NULL OR quarantine_until < now())
			ORDER BY (modem_id IS NOT NULL) DESC, random() LIMIT 1
		`, modemID); err == nil {
			domainID = &d
		}
	}

	// commit lock + sending status — fora da transação fazemos o envio real
	if err := tx.Commit(); err != nil {
		return false, err
	}

	// envio (fora da TX para não segurar lock)
	err = sendViaEvolution(ctx, db, modemID, groupID, catalogID, *accountID, templateID, domainID)
	if err != nil {
		markFailed(ctx, db, qid, *accountID, modemID, err)
		return true, nil
	}

	markSent(ctx, db, qid, groupID, catalogID, *accountID, templateID, domainID)
	return true, nil
}

// sendViaEvolution envia a mensagem via Evolution API.
// TODO: integrar com internal/messaging/evolution/ pattern existente.
// Por ora: stub que sempre retorna sucesso simulado e log estruturado.
func sendViaEvolution(ctx context.Context, db *sqlx.DB, modemID, groupID, catalogID, accountID int64, templateID, domainID *int64) error {
	slog.Info("sender.send.stub", "modem", modemID, "group", groupID, "catalog", catalogID, "account", accountID)
	// Stub: integração real requer buscar credenciais do modem (wa_account_id, baseURL, apiKey, instance)
	// e chamar os helpers sendEvolutionMessage/sendEvolutionMedia do dispatch_worker.
	return nil
}

func markSent(ctx context.Context, db *sqlx.DB, qid, groupID, catalogID, accountID int64, templateID, domainID *int64) {
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return
	}
	defer tx.Rollback() //nolint:errcheck
	_, _ = tx.ExecContext(ctx, "UPDATE send_queue SET status='sent' WHERE id=$1", qid)
	_, _ = tx.ExecContext(ctx, `
		INSERT INTO send_log (send_queue_id, group_id, account_id, catalog_id, domain_id, template_id, status, sent_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'sent', now())
	`, qid, groupID, accountID, catalogID, domainID, templateID)
	// anti-repeat: registra no histórico de envio por grupo
	_, _ = tx.ExecContext(ctx, `
		INSERT INTO group_sent_history (group_id, dedup_key, sent_at)
		SELECT $1, dedup_key, now() FROM catalog WHERE id=$2
		ON CONFLICT DO NOTHING
	`, groupID, catalogID)
	// touch account
	_, _ = tx.ExecContext(ctx, "UPDATE accounts SET last_sent_at=now(), consecutive_failures=0 WHERE id=$1", accountID)
	_ = tx.Commit()
}

func markFailed(ctx context.Context, db *sqlx.DB, qid, accountID, modemID int64, sendErr error) {
	payload, _ := json.Marshal(map[string]any{"error": sendErr.Error()})
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return
	}
	defer tx.Rollback() //nolint:errcheck
	_, _ = tx.ExecContext(ctx, "UPDATE send_queue SET status='failed' WHERE id=$1", qid)
	_, _ = tx.ExecContext(ctx, "UPDATE accounts SET consecutive_failures = consecutive_failures+1 WHERE id=$1", accountID)
	var failures int
	_ = tx.GetContext(ctx, &failures, "SELECT consecutive_failures FROM accounts WHERE id=$1", accountID)
	if failures >= 3 {
		_, _ = tx.ExecContext(ctx, "UPDATE accounts SET status='quarantine' WHERE id=$1", accountID)
		_, _ = tx.ExecContext(ctx, `
			INSERT INTO ban_events (account_id, modem_id, reason, raw_response)
			VALUES ($1, $2, 'consecutive_failures>=3', $3)
		`, accountID, modemID, payload)
	}
	_ = tx.Commit()
	// se 2+ bans/24h no mesmo modem → pausa modem
	var bans24h int
	_ = db.GetContext(ctx, &bans24h, `SELECT COUNT(*) FROM ban_events WHERE modem_id=$1 AND detected_at > now()-INTERVAL '24h'`, modemID)
	if bans24h >= 2 {
		_, _ = db.ExecContext(ctx, `UPDATE modems SET status='paused', paused_until=now()+INTERVAL '1 hour', paused_reason='2+ bans/24h' WHERE id=$1`, modemID)
	}
}

func getCooldownSeconds(ctx context.Context, db *sqlx.DB, modemID int64) float64 {
	var v float64
	_ = db.GetContext(ctx, &v, "SELECT get_param('cooldown_seconds','modem',$1)", modemID)
	if v == 0 {
		v = 90
	}
	return v
}

func inSendWindow() bool {
	loc, _ := time.LoadLocation("America/Sao_Paulo")
	h := time.Now().In(loc).Hour()
	return h >= 21 || h < 6
}
