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
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/adapters"
	"snatcher/backendv2/internal/services/affiliates"
	"snatcher/backendv2/internal/services/compose"
	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/notifier"
)

var accountNotifier *notifier.Notifier

// SetNotifier registra o notifier para alertas de conta (quarentena por falhas).
func SetNotifier(n *notifier.Notifier) { accountNotifier = n }

// rowGetter abstrai *sqlx.DB e *sqlx.Tx para resolver domínio de redirect na fila.
type rowGetter interface {
	GetContext(ctx context.Context, dest any, query string, args ...any) error
}

// pickRedirectDomainID escolhe redirect_domains.id: afinidade modem + pool comum,
// depois qualquer ativo fora de quarentena (evita fila presa quando só existem domínios ligados a outro modem).
func pickRedirectDomainID(ctx context.Context, q rowGetter, modemID int64) (*int64, error) {
	var id int64
	err := q.GetContext(ctx, &id, `
		SELECT id FROM redirect_domains
		WHERE enabled=true
		  AND (modem_id=$1 OR modem_id IS NULL)
		  AND (quarantine_until IS NULL OR quarantine_until < now())
		ORDER BY (modem_id IS NOT NULL) DESC, id
		LIMIT 1`, modemID)
	if err == nil {
		return &id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	err = q.GetContext(ctx, &id, `
		SELECT id FROM redirect_domains
		WHERE enabled=true
		  AND (quarantine_until IS NULL OR quarantine_until < now())
		ORDER BY id
		LIMIT 1`)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &id, nil
}

// resolveWorkingRedirectHost garante host + id de um domínio redirect utilizável.
// Se domainID da fila está desativado, em quarentena ou foi apagado, repesca outro.
func resolveWorkingRedirectHost(ctx context.Context, db *sqlx.DB, modemID int64, domainID *int64) (host string, outID int64, err error) {
	tryHost := func(id int64) (string, error) {
		var h sql.NullString
		e := db.GetContext(ctx, &h, `
			SELECT host FROM redirect_domains
			WHERE id=$1 AND enabled=true
			  AND (quarantine_until IS NULL OR quarantine_until < now())`, id)
		if e != nil {
			return "", e
		}
		if !h.Valid || strings.TrimSpace(h.String) == "" {
			return "", fmt.Errorf("host vazio ou nulo")
		}
		return strings.TrimSpace(h.String), nil
	}

	if domainID != nil {
		if h, e := tryHost(*domainID); e == nil {
			return h, *domainID, nil
		}
		slog.Warn("sender.redirect_domain_stale", "modem", modemID, "domain_id", *domainID,
			"hint", "repescando — domínio desativado, em quarentena ou removido")
	}

	picked, e := pickRedirectDomainID(ctx, db, modemID)
	if e != nil {
		return "", 0, e
	}
	if picked == nil {
		return "", 0, fmt.Errorf("nenhum domínio redirect ativo (enabled=true, fora de quarentena). Confira /admin/domains — linhas com enabled=false não entram no envio")
	}
	h, e := tryHost(*picked)
	if e != nil {
		return "", 0, fmt.Errorf("redirect_domains id=%d válido para escolha mas host não resolveu: %w", *picked, e)
	}
	return h, *picked, nil
}

func sendViaEvolution(ctx context.Context, db *sqlx.DB, modemID, groupID, catalogID, accountID int64, templateID, domainID *int64) (*int64, error) {
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
		return nil, fmt.Errorf("fetch catalog %d: %w", catalogID, err)
	}

	// 2. busca JID do grupo
	var jid sql.NullString
	_ = db.GetContext(ctx, &jid, `SELECT whatsapp_jid FROM groups WHERE id=$1`, groupID)
	if !jid.Valid || jid.String == "" {
		return nil, fmt.Errorf("grupo %d sem whatsapp_jid", groupID)
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
	domainHost, useDomainID, err := resolveWorkingRedirectHost(ctx, db, modemID, domainID)
	if err != nil {
		return nil, fmt.Errorf("shortlink domínio: %w", err)
	}

	// 4a. Injetar código de afiliado — OBRIGATÓRIO. Sem afiliado = falha no envio.
	var affiliatePrograms []models.AffiliateProgram
	_ = db.SelectContext(ctx, &affiliatePrograms, `SELECT id, marketplace, credentials, active FROM affiliate_programs WHERE active=true`)
	marketplace := affiliates.InferMarketplaceFromProductURL(cat.CanonicalURL)
	affiliateURL, _, affiliateErr := affiliates.BuildLinkStrict(cat.CanonicalURL, marketplace, affiliatePrograms)
	if affiliateErr != nil {
		return nil, fmt.Errorf("sem programa de afiliado para %s — link sem código não pode ser enviado: %w", marketplace, affiliateErr)
	}

	// 4b. Gera shortlink com a URL de afiliado (não a URL limpa).
	var groupShort string
	if err := db.GetContext(ctx, &groupShort, `SELECT ensure_group_shortlink($1, $2)`, catalogID, groupID); err != nil {
		return nil, fmt.Errorf("ensure_group_shortlink(catalog=%d, group=%d): %w", catalogID, groupID, err)
	}
	groupShort = strings.TrimSpace(groupShort)
	if groupShort == "" {
		return nil, fmt.Errorf("ensure_group_shortlink retornou vazio (catalog=%d, group=%d)", catalogID, groupID)
	}

	if _, err := db.ExecContext(ctx, `
				INSERT INTO short_links (short_id, dest_url, source)
				VALUES ($1, $2, $3)
				ON CONFLICT (short_id) DO UPDATE SET dest_url = EXCLUDED.dest_url, source = EXCLUDED.source
			`, groupShort, affiliateURL, marketplace); err != nil {
		return nil, fmt.Errorf("short_links: %w", err)
	}
	link := "https://" + domainHost + "/v/" + groupShort

	// 5. interpola variáveis no template — usa V2 que rejeita desconto inválido.
	var msg string
	msg, err = renderTemplateBodyV2(body, cat.Title, cat.PriceOriginal, cat.PriceCurrent, cat.DiscountPct, link)
	if err != nil {
		return nil, err
	}

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
	resolvedID := useDomainID
	if imagePath != "" {
		err := SendTextWithMedia(ctx, SendMediaArgs{
			Instance:  instance,
			JID:       jid.String,
			Caption:   msg,
			ImagePath: imagePath,
		})
		return &resolvedID, err
	}
	if imageURL != "" {
		// Usa o mesmo adapter que funciona no dispatch manual
		evo := adapters.NewEvolution(os.Getenv("EVOLUTION_URL"), os.Getenv("EVOLUTION_API_KEY"), instance)
		err := evo.SendImage(ctx, jid.String, imageURL, msg)
		return &resolvedID, err
	}
	// sem imagem — envia só texto
	err = SendTextWithMedia(ctx, SendMediaArgs{Instance: instance, JID: jid.String, Caption: msg})
	return &resolvedID, err
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

var (
	// ErrNoValidDiscount indica que price_original é NULL ou não é maior que price_current.
	// Previne disparo com mensagem "caiu de 190 para 190 (0% OFF)".
	ErrNoValidDiscount = errors.New("no valid discount: price_original is NULL or <= price_current")

	// ErrDiscountZero indica que o percentual de desconto é zero ou negativo.
	ErrDiscountZero = errors.New("discount is zero or negative")
)

// renderTemplateBody substitui as variáveis {xxx} pelo dados reais do produto.
// Mantido para compatibilidade com callers legados.
// Retorna "" quando price_original é NULL, igual ou menor que price_current, ou desconto é zero/negativo —
// prevenindo a mensagem "caiu de 190 para 190 (0% OFF)" (bug 190→190).
// Callers devem tratar retorno "" como sinal de desconto inválido e descartar o envio.
func renderTemplateBody(body, titulo string, precoDeNull sql.NullFloat64, precoPor, descontoPct float64, link string) string {
	if !precoDeNull.Valid || precoDeNull.Float64 <= precoPor {
		return ""
	}
	if descontoPct <= 0 {
		return ""
	}

	precoDe := precoDeNull.Float64

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

// renderTemplateBodyV2 substitui as variáveis {xxx} e valida que o desconto é real.
// Retorna ErrNoValidDiscount se price_original for NULL ou <= price_current.
// Retorna ErrDiscountZero se descontoPct for zero ou negativo.
// Use este em lugar de renderTemplateBody para todos os novos callers.
func renderTemplateBodyV2(body, titulo string, precoDeNull sql.NullFloat64, precoPor, descontoPct float64, link string) (string, error) {
	if !precoDeNull.Valid || precoDeNull.Float64 <= precoPor {
		return "", ErrNoValidDiscount
	}

	if descontoPct <= 0 {
		return "", ErrDiscountZero
	}

	precoDe := precoDeNull.Float64

	r := strings.NewReplacer(
		"{titulo}",    titulo,
		"{preco_de}",  formatMoney(precoDe),
		"{preco_por}", formatMoney(precoPor),
		"{desconto}",  fmt.Sprintf("%.0f", descontoPct),
		"{link}",      link,
		"{emoji}",     pickEmoji(descontoPct),
	)
	return r.Replace(body), nil
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
	// touch group: rastreia o último envio do grupo (exibido na listagem/UI; antes ficava NULL)
	_, _ = tx.ExecContext(ctx, "UPDATE groups SET last_message_at=now() WHERE id=$1", groupID)
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
	wentQuarantine := float64(failures) >= quarantineThreshold
	if wentQuarantine {
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

	if wentQuarantine && accountNotifier != nil {
		var label string
		_ = db.GetContext(ctx, &label, `
			SELECT COALESCE(NULLIF(nickname,''), NULLIF(phone,''), '#' || id::text) FROM accounts WHERE id=$1
		`, accountID)
		errStr := sendErr.Error()
		if len(errStr) > 280 {
			errStr = errStr[:280] + "…"
		}
		body := fmt.Sprintf(
			"Conta %s (id %d) foi para quarentena após %d falhas seguidas (limite %.0f).\nÚltimo erro: %s",
			label, accountID, failures, quarantineThreshold, errStr,
		)
		accountNotifier.Notify(notifier.KindAccountIssue, body, fmt.Sprintf("quarantine:%d", accountID), 6*time.Hour)
	}

	// se 3+ bans/24h no mesmo modem → pausa modem (era 2, aumentado para menos agressividade)
	var bans24h int
	_ = db.GetContext(ctx, &bans24h, `SELECT COUNT(*) FROM ban_events WHERE modem_id=$1 AND detected_at > now()-INTERVAL '24h'`, modemID)
	if bans24h >= 3 {
		_, _ = db.ExecContext(ctx, `UPDATE modems SET status='paused', paused_until=now()+INTERVAL '1 hour', paused_reason='3+ bans/24h' WHERE id=$1`, modemID)
	}
}

// markInvalid marca um item da send_queue como 'invalid' — usado quando o produto
// não tem desconto real (price_original NULL ou <= price_current). Não penaliza a conta
// pois não é falha de infra.
func markInvalid(ctx context.Context, db *sqlx.DB, qid int64, reason error) {
	_, _ = db.ExecContext(ctx,
		`UPDATE send_queue SET status='invalid', last_error=$1 WHERE id=$2`,
		reason.Error(), qid,
	)
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

