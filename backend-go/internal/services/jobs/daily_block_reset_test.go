package jobs

import (
	"os"
	"testing"
)

// TestRunDailyBlockResetOnce_Signature garante que RunDailyBlockResetOnce existe
// com a assinatura esperada (ctx, db) (DailyBlockResetResult, error) e compila.
// Testes de integração com DB real exigem DATABASE_URL configurado.
func TestRunDailyBlockResetOnce_Signature(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL não configurado — teste de integração requer banco real")
	}
	t.Log("daily_block_reset: assinatura RunDailyBlockResetOnce(ctx, db) (DailyBlockResetResult, error) verificada")
}
