package curator

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
)

// Sender é a interface mínima para enviar mensagem WA via Evolution.
// Implementação concreta: EvolutionSender neste pacote.
type Sender interface {
	SendText(ctx context.Context, instance string, jid string, text string) error
}

// DispatchToGroup envia msg ao grupo de role 'critical' ou 'tracking'.
func DispatchToGroup(ctx context.Context, db *sqlx.DB, sender Sender, role, text string) error {
	var jid, instance string
	err := db.QueryRowxContext(ctx, `
		SELECT g.jid, COALESCE(wa.instance, 'default')
		FROM groups g
		LEFT JOIN waaccount wa ON wa.id = g.wa_account_id
		WHERE g.is_curator_group = true AND g.curator_role = $1
		LIMIT 1
	`, role).Scan(&jid, &instance)
	if err != nil {
		return fmt.Errorf("no curator group for role %s: %w", role, err)
	}
	if jid == "" {
		return fmt.Errorf("curator group jid empty for role %s", role)
	}
	return sender.SendText(ctx, instance, jid, text)
}
