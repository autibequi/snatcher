package senders

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
)

// queryRoutingDomain busca o domain_id de maior afinidade na tabela modem_routing
// para o modem informado, filtrando apenas domínios ativos e fora de quarentena.
// Retorna sql.ErrNoRows quando o modem não tem row na tabela (modem novo ou dormente).
func queryRoutingDomain(ctx context.Context, db *sqlx.DB, modemID int64) (int64, error) {
	var domainID int64
	err := db.GetContext(ctx, &domainID, `
		SELECT mr.domain_id
		FROM modem_routing mr
		JOIN redirect_domains rd ON rd.id = mr.domain_id
		WHERE mr.modem_id = $1
		  AND rd.enabled = true
		  AND (rd.quarantine_until IS NULL OR rd.quarantine_until < now())
		ORDER BY mr.affinity_score DESC, mr.last_used_at NULLS FIRST
		LIMIT 1
	`, modemID)
	return domainID, err
}

// touchLastUsed atualiza last_used_at na linha (modem, domain) para rastreamento de afinidade.
// Falha ignorada intencionalmente — não deve bloquear o caminho crítico de envio.
func touchLastUsed(ctx context.Context, db *sqlx.DB, modemID int64, domainID int64) {
	_, _ = db.ExecContext(ctx, `
		UPDATE modem_routing
		SET last_used_at = now()
		WHERE modem_id = $1
		  AND domain_id = $2
	`, modemID, domainID)
}

// PickDomain resolve o domain_id para o modem informado usando a tabela modem_routing.
// Quando não há row (modem novo, dormente ou seed ainda não rodou), aplica fallback
// para pickRedirectDomainID — função legada de afinidade em dois estágios.
// O fallback NÃO pode ser removido em W1: modems dormentes 72h não terão row
// em modem_routing (R6 do plano), e a função legada continua como safety net.
func PickDomain(ctx context.Context, db *sqlx.DB, modemID int64) (*int64, error) {
	domainID, err := queryRoutingDomain(ctx, db, modemID)
	if err == nil {
		touchLastUsed(ctx, db, modemID, domainID)
		return &domainID, nil
	}

	if err != sql.ErrNoRows {
		return nil, err
	}

	// Fallback legado: pickRedirectDomainID aceita rowGetter; *sqlx.DB satisfaz a interface.
	return pickRedirectDomainID(ctx, db, modemID)
}

// seedModemRouting upserta uma linha em modem_routing para o modem informado,
// usando pickRedirectDomainID para obter o domain_id de afinidade atual.
// Ignora modems cujo domínio não pode ser resolvido (nenhum domínio ativo).
func seedModemRouting(ctx context.Context, db *sqlx.DB, modemID int64) error {
	domainID, err := pickRedirectDomainID(ctx, db, modemID)
	if err != nil {
		return err
	}
	if domainID == nil {
		// Nenhum domínio ativo disponível para este modem — pular silenciosamente.
		return nil
	}

	_, err = db.ExecContext(ctx, `
		INSERT INTO modem_routing (modem_id, domain_id, affinity_score, seeded_at)
		VALUES ($1, $2, 1.0, now())
		ON CONFLICT (modem_id, domain_id)
		DO UPDATE SET seeded_at = now()
	`, modemID, *domainID)
	return err
}

// SeedRoutingShadow popula modem_routing executando pickRedirectDomainID para cada
// modem habilitado no sistema. Deve ser chamado como job background 72h antes do
// cutover do dispatcher (gate manual — sem time-skip nesta execução).
//
// Invariante I5: após 72h de shadow, a divergência entre modem_routing e
// pickRedirectDomainID deve ser < 1% para liberar o cutover.
func SeedRoutingShadow(ctx context.Context, db *sqlx.DB) error {
	rows, err := db.QueryContext(ctx, `
		SELECT id FROM modems WHERE enabled = true
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var modemID int64
		if err := rows.Scan(&modemID); err != nil {
			return err
		}

		if err := seedModemRouting(ctx, db, modemID); err != nil {
			// Falha em um modem não deve abortar o seed inteiro.
			// O modem ficará sem row e usará o fallback em PickDomain.
			continue
		}
	}

	return rows.Err()
}
