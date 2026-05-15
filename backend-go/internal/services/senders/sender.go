package senders

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/adapters"
	"snatcher/backendv2/internal/services/affiliates"
	"snatcher/backendv2/internal/services/algo"
	"snatcher/backendv2/internal/services/compose"
	"snatcher/backendv2/internal/services/llm"
)

// RunSender é a goroutine principal do sender de 1 modem.
// Drena send_queue WHERE modem_id=X com FOR UPDATE SKIP LOCKED.
func RunSender(ctx context.Context, db *sqlx.DB, modemID int64) {
	slog.Info("sender.start", "modem", modemID)

	// lastGateLog rastreia quando cada gate logou pela última vez para evitar spam.
	// Cada gate loga na primeira ocorrência e depois a cada 5 minutos.
	lastGateLog := map[string]time.Time{}
	gateLog := func(gate string, lvl slog.Level, args ...any) {
		if time.Since(lastGateLog[gate]) < 5*time.Minute {
			return
		}
		lastGateLog[gate] = time.Now()
		slog.Log(ctx, lvl, "sender.gate."+gate, args...)
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// gate global: flag use_send_queue
		var flag float64
		if err := db.GetContext(ctx, &flag, "SELECT get_param('use_send_queue','global',NULL)"); err != nil || flag == 0 {
			gateLog("queue_flag", slog.LevelWarn,
				"modem", modemID, "flag", flag,
				"fix", "habilite use_send_queue via tunable_params ou app_config")
			time.Sleep(30 * time.Second)
			continue
		}

		// gate: modem status
		var status string
		if err := db.GetContext(ctx, &status, "SELECT status FROM modems WHERE id=$1", modemID); err == nil && status != "active" {
			gateLog("modem_status", slog.LevelWarn,
				"modem", modemID, "status", status)
			time.Sleep(60 * time.Second)
			continue
		}

		// gate: janela de envio configurada em Settings (send_start_hour / send_end_hour)
		if !algo.InSendWindow(ctx, db) {
			loc, _ := time.LoadLocation("America/Sao_Paulo")
			gateLog("window", slog.LevelInfo,
				"modem", modemID, "hour_sp", time.Now().In(loc).Hour())
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

	var qid, groupID int64
	var catalogID *int64
	var accountID, templateID, domainID *int64
	var messageOverride, imageURLOverride sql.NullString
	err = tx.QueryRowxContext(ctx, `
		SELECT id, group_id, catalog_id, account_id, template_id, domain_id,
		       message_override, image_url_override
		FROM send_queue
		WHERE modem_id=$1 AND status='pending'
		ORDER BY enqueued_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`, modemID).Scan(&qid, &groupID, &catalogID, &accountID, &templateID, &domainID,
		&messageOverride, &imageURLOverride)
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
	// Disparo manual: message_override presente → texto direto, sem produto.
	if messageOverride.Valid && messageOverride.String != "" {
		err = sendRawText(ctx, db, modemID, groupID, *accountID, messageOverride.String, imageURLOverride.String)
	} else if catalogID != nil {
		err = sendViaEvolution(ctx, db, modemID, groupID, *catalogID, *accountID, templateID, domainID)
	} else {
		err = fmt.Errorf("send_queue id=%d: sem catalog_id nem message_override", qid)
	}
	if err != nil {
		slog.Error("sender.send_failed", "queue_id", qid, "modem", modemID, "group", groupID, "err", err)
		markFailed(ctx, db, qid, *accountID, modemID, err)
		return true, nil
	}

	markSent(ctx, db, qid, groupID, catalogID, *accountID, templateID, domainID)
	return true, nil
}

func sendViaEvolution(ctx context.Context, db *sqlx.DB, modemID, groupID, catalogID, accountID int64, templateID, domainID *int64) error {
	// 1. busca dados do produto
	var cat struct {
		Title           string          `db:"title"`
		PriceCurrent    float64         `db:"price_current"`
		PriceOriginal   sql.NullFloat64 `db:"price_original"`
		DiscountPct     float64         `db:"discount_pct"`
		CanonicalURL    string          `db:"canonical_url"`
		ShortID         string          `db:"short_id"`
		ImageURL        sql.NullString  `db:"image_url"`
		CachedImagePath sql.NullString  `db:"cached_image_path"`
	}
	if err := db.GetContext(ctx, &cat, `
		SELECT title, price_current, price_original, discount_pct, canonical_url,
		       short_id, image_url, cached_image_path
		FROM catalog WHERE id=$1
	`, catalogID); err != nil {
		return fmt.Errorf("fetch catalog %d: %w", catalogID, err)
	}

	// 2. busca JID do grupo
	var jid sql.NullString
	_ = db.GetContext(ctx, &jid, `SELECT whatsapp_jid FROM groups WHERE id=$1`, groupID)
	if !jid.Valid || jid.String == "" {
		return fmt.Errorf("grupo %d sem whatsapp_jid", groupID)
	}

	// 3. busca corpo do template
	var body string
	if templateID != nil {
		_ = db.GetContext(ctx, &body, `SELECT body FROM templates WHERE id=$1 AND enabled=true`, *templateID)
	}
	if body == "" {
		body = "{emoji} {titulo}\nDe R$ {preco_de} por R$ {preco_por} ({desconto}% OFF)\n{link}"
	}

	// 4. monta link de redirect — shortlink por (group, catalog) para
	//    atribuição determinística de cliques (vs catalog.short_id que era
	//    global e causava attribution errada quando vários grupos enviavam
	//    o mesmo produto).
	// Se domainID não veio na send_queue, busca o primeiro domínio ativo.
	if domainID == nil {
		var id int64
		if err := db.GetContext(ctx, &id, `SELECT id FROM redirect_domains WHERE enabled=true ORDER BY id LIMIT 1`); err == nil {
			domainID = &id
		}
	}

	// 4a. Injetar código de afiliado — OBRIGATÓRIO. Sem afiliado = falha no envio.
	var affiliatePrograms []models.AffiliateProgram
	_ = db.SelectContext(ctx, &affiliatePrograms, `SELECT id, marketplace, credentials, active FROM affiliate_programs WHERE active=true`)
	marketplace := affiliates.InferMarketplaceFromProductURL(cat.CanonicalURL)
	affiliateURL, _, affiliateErr := affiliates.BuildLinkStrict(cat.CanonicalURL, marketplace, affiliatePrograms)
	if affiliateErr != nil {
		return fmt.Errorf("sem programa de afiliado para %s — link sem código não pode ser enviado: %w", marketplace, affiliateErr)
	}

	// 4b. Gera shortlink com a URL de afiliado (não a URL limpa).
	link := affiliateURL // fallback: URL de afiliado direta (sem shortener)
	if domainID != nil {
		var groupShort sql.NullString
		_ = db.GetContext(ctx, &groupShort,
			`SELECT ensure_group_shortlink($1, $2)`, catalogID, groupID)
		if groupShort.Valid && groupShort.String != "" {
			// Armazena URL de afiliado no short_links para que o redirect use ela
			_, _ = db.ExecContext(ctx, `
				INSERT INTO short_links (short_id, dest_url, source)
				VALUES ($1, $2, $3)
				ON CONFLICT (short_id) DO UPDATE SET dest_url = EXCLUDED.dest_url
			`, groupShort.String, affiliateURL, marketplace)
			var domain sql.NullString
			if err := db.GetContext(ctx, &domain, `SELECT host FROM redirect_domains WHERE id=$1`, *domainID); err == nil && domain.Valid {
				link = "https://" + domain.String + "/v/" + groupShort.String
			}
		}
	}
	if link == affiliateURL {
		// Não conseguiu shortlink — obrigatório ter shortlink para rastreamento
		return fmt.Errorf("shortlink não pôde ser gerado (sem domínio configurado) — envio cancelado para preservar rastreamento")
	}

	// 5. interpola variáveis no template
	msg := renderTemplateBody(body, cat.Title, cat.PriceOriginal, cat.PriceCurrent, cat.DiscountPct, link)

	// 5b. personalização via LLM (opcional — só se use_llm_personalization = true)
	{
		var usePersonalize bool
		_ = db.GetContext(ctx, &usePersonalize, `SELECT use_llm_personalization FROM appconfig LIMIT 1`)
		if usePersonalize {
			msg = personalizeMsgWithLLM(ctx, db, msg)
		}
	}

	// 6. define imagem: cached (base64) > remota (URL)
	imagePath := ""
	imageURL := ""
	if cat.CachedImagePath.Valid && cat.CachedImagePath.String != "" {
		if _, err := os.Stat(cat.CachedImagePath.String); err == nil {
			imagePath = cat.CachedImagePath.String
		} else {
			// Arquivo cacheado não existe (container reiniciado) — limpa o registro e usa URL
			slog.Warn("sender.cache_miss", "path", cat.CachedImagePath.String, "catalog", catalogID, "fallback", "image_url")
			_, _ = db.ExecContext(ctx, `UPDATE catalog SET cached_image_path=NULL WHERE id=$1`, catalogID)
		}
	}
	if imagePath == "" && cat.ImageURL.Valid && cat.ImageURL.String != "" {
		imageURL = cat.ImageURL.String
	}

	// 7. envia via Evolution API
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	slog.Info("sender.send", "modem", modemID, "group", groupID, "catalog", catalogID, "template", templateID, "jid", jid.String)
	if imagePath != "" {
		return SendTextWithMedia(ctx, SendMediaArgs{
			Instance:  instance,
			JID:       jid.String,
			Caption:   msg,
			ImagePath: imagePath,
		})
	}
	if imageURL != "" {
		return sendImageViaURL(ctx, instance, jid.String, imageURL, msg)
	}
	// sem imagem — envia só texto
	return SendTextWithMedia(ctx, SendMediaArgs{Instance: instance, JID: jid.String, Caption: msg})
}

// sendImageViaURL envia imagem via URL remota usando Evolution /message/sendMedia.
func sendImageViaURL(ctx context.Context, instance, jid, imageURL, caption string) error {
	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	if baseURL == "" {
		return fmt.Errorf("evolution_url empty")
	}
	payload, _ := json.Marshal(map[string]any{
		"number":    jid,
		"mediatype": "image",
		"media":     imageURL,
		"caption":   caption,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/message/sendMedia/"+instance, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("Content-Type", "application/json")
	cli := &http.Client{Timeout: 30 * time.Second}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("evolution sendMedia status %d: %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}
	return nil
}

// renderTemplateBody substitui as variáveis {xxx} pelo dados reais do produto.
func renderTemplateBody(body, titulo string, precoDeNull sql.NullFloat64, precoPor, descontoPct float64, link string) string {
	precoDe := precoPor
	if precoDeNull.Valid && precoDeNull.Float64 > precoPor {
		precoDe = precoDeNull.Float64
	}

	r := strings.NewReplacer(
		"{titulo}",    titulo,
		"{preco_de}",  formatMoney(precoDe),
		"{preco_por}", formatMoney(precoPor),
		"{desconto}",  fmt.Sprintf("%.0f", descontoPct),
		"{link}",      link,
		"{emoji}",     pickEmoji(descontoPct),
	)
	return r.Replace(body)
}

// sendRawText envia texto pré-montado (disparo manual) sem buscar produto no catálogo.
func sendRawText(ctx context.Context, db *sqlx.DB, modemID, groupID, accountID int64, message, imageURL string) error {
	// Busca JID do grupo e instância Evolution da conta.
	var jid sql.NullString
	_ = db.GetContext(ctx, &jid, `SELECT whatsapp_jid FROM groups WHERE id=$1`, groupID)
	if !jid.Valid || jid.String == "" {
		return fmt.Errorf("grupo %d sem whatsapp_jid — importe o grupo em /admin/senders", groupID)
	}

	var evoURL, evoKey sql.NullString
	_ = db.GetContext(ctx, &evoURL, `SELECT value FROM app_config WHERE key='EVOLUTION_URL' LIMIT 1`)
	_ = db.GetContext(ctx, &evoKey, `SELECT value FROM app_config WHERE key='EVOLUTION_API_KEY' LIMIT 1`)

	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if evoURL.Valid && evoURL.String != "" {
		baseURL = evoURL.String
	}
	if evoKey.Valid && evoKey.String != "" {
		apiKey = evoKey.String
	}
	if instance == "" {
		instance = "default"
	}
	if baseURL == "" {
		return fmt.Errorf("Evolution URL não configurada")
	}

	evo := adapters.NewEvolutionWithAccount(accountID, baseURL, apiKey, instance)
	if imageURL != "" {
		return evo.SendImage(ctx, jid.String, imageURL, message)
	}
	return evo.SendText(ctx, jid.String, message)
}

func formatMoney(v float64) string {
	// ex: 1234.5 → "1.234,50"
	s := fmt.Sprintf("%.2f", v)
	// troca ponto decimal por vírgula
	s = strings.ReplaceAll(s, ".", ",")
	// insere separador de milhar
	if len(s) > 6 {
		s = s[:len(s)-6] + "." + s[len(s)-6:]
	}
	return s
}

func pickEmoji(pct float64) string {
	switch {
	case pct >= 50:
		return "🔥"
	case pct >= 30:
		return "⚡"
	case pct >= 15:
		return "💰"
	default:
		return "🛒"
	}
}

func markSent(ctx context.Context, db *sqlx.DB, qid, groupID int64, catalogID *int64, accountID int64, templateID, domainID *int64) {
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
	// anti-repeat: só registra histórico se há produto (disparos manuais sem catalog_id não entram no anti-repeat)
	if catalogID != nil {
		_, _ = tx.ExecContext(ctx, `
			INSERT INTO group_sent_history (group_id, dedup_key, sent_at, price_at_send)
			SELECT $1, dedup_key, now(), price_current FROM catalog WHERE id=$2
			ON CONFLICT DO NOTHING
		`, groupID, *catalogID)
	}
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
	// Threshold via tunable_params; default 5 (era 3, aumentado para tolerar falhas transientes da Evolution API).
	var quarantineThreshold float64
	_ = db.GetContext(ctx, &quarantineThreshold, `SELECT get_param('quarantine_threshold','global',NULL)`)
	if quarantineThreshold <= 0 {
		quarantineThreshold = 5
	}
	if float64(failures) >= quarantineThreshold {
		_, _ = tx.ExecContext(ctx, "UPDATE accounts SET status='quarantine' WHERE id=$1", accountID)
		_, _ = tx.ExecContext(ctx, `
			INSERT INTO ban_events (account_id, modem_id, reason, raw_response)
			VALUES ($1, $2, 'consecutive_failures>='||$3, $4)
		`, accountID, modemID, int(quarantineThreshold), payload)
	}
	_ = tx.Commit()

	// Registra falha no send_log para aparecer no Activity → visibilidade de erros silenciosos.
	_, _ = db.ExecContext(ctx, `
		INSERT INTO send_log (send_queue_id, group_id, account_id, catalog_id, template_id, domain_id, status, error_code, sent_at)
		SELECT $1, group_id, $2, catalog_id, template_id, domain_id, 'failed', $3, now()
		FROM send_queue WHERE id=$1
	`, qid, accountID, sendErr.Error())

	// se 3+ bans/24h no mesmo modem → pausa modem (era 2, aumentado para menos agressividade)
	var bans24h int
	_ = db.GetContext(ctx, &bans24h, `SELECT COUNT(*) FROM ban_events WHERE modem_id=$1 AND detected_at > now()-INTERVAL '24h'`, modemID)
	if bans24h >= 3 {
		_, _ = db.ExecContext(ctx, `UPDATE modems SET status='paused', paused_until=now()+INTERVAL '1 hour', paused_reason='3+ bans/24h' WHERE id=$1`, modemID)
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

// personalizeMsgWithLLM chama a LLM para reescrever msg de forma mais humanizada.
// Lê credenciais LLM do appconfig. Falha graciosamente: retorna original se LLM indisponível.
func personalizeMsgWithLLM(ctx context.Context, db *sqlx.DB, original string) string {
	var cfg struct {
		Provider   string `db:"llm_provider"`
		APIKey     string `db:"llm_api_key"`
		Model      string `db:"llm_model"`
		BaseURL    string `db:"llm_base_url"`
	}
	if err := db.GetContext(ctx, &cfg, `
		SELECT COALESCE(llm_provider,'') AS llm_provider,
		       COALESCE(llm_api_key,'') AS llm_api_key,
		       COALESCE(llm_model,'') AS llm_model,
		       COALESCE(llm_base_url,'') AS llm_base_url
		FROM appconfig LIMIT 1
	`); err != nil {
		slog.Warn("personalizer: falha ao ler config LLM", "err", err)
		return original
	}
	if cfg.APIKey == "" && cfg.BaseURL == "" {
		slog.Warn("personalizer: LLM não configurada, usando texto original")
		return original
	}
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://openrouter.ai/api/v1"
	}
	cli := llm.NewOpenAICompat(baseURL, cfg.APIKey)
	return compose.PersonalizeMessage(ctx, cli, original)
}

