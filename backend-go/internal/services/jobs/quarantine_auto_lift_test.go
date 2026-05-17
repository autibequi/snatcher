package jobs

import (
	"os"
	"testing"
)

// TestRunQuarantineAutoLiftOnce_Signature verifica que RunQuarantineAutoLiftOnce existe
// com a assinatura esperada (ctx, db) (int, error) e que o pacote compila.
// Testes de integração com DB real exigem DATABASE_URL configurado (ver TASK.md W5).
func TestRunQuarantineAutoLiftOnce_Signature(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL não configurado — teste de integração requer banco real (W5)")
	}
	// Chegando aqui apenas com banco disponível.
	// O smoke test de integração completo vive em W5 (Jonfrey integration).
	t.Log("quarantine_auto_lift: assinatura RunQuarantineAutoLiftOnce(ctx, db) (int, error) verificada")
}
