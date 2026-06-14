package admin

// Testes unitários do motor de alertas de saúde.
// buildAlerts é uma função pura (sem I/O de banco) — testável sem container.

import (
	"strings"
	"testing"
)

// TestBuildAlerts_NoAlertsWhenHealthy verifica que, com sistema saudável, nenhum alerta é gerado.
func TestBuildAlerts_NoAlertsWhenHealthy(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:    0,
		ActiveWorkers: 2,
		CircuitBreaker: map[string]string{
			"evolution": "closed",
		},
		ContasWA: ContasWAStatus{
			Total:             2,
			PrimaryConectadas: 1,
			BackupConectadas:  1,
			Quarentena:        0,
			Desconectadas:     0,
		},
		Scan: ScanStatus{
			Rodando:            true,
			MarketplacesAtivos: 2,
		},
		Janela: JanelaStatus{
			Aberta:        true,
			SendStartHour: 8,
			SendEndHour:   22,
		},
	}

	alertas := buildAlerts(snapshot)

	// Critério V: sistema saudável → lista vazia.
	if len(alertas) != 0 {
		t.Errorf("esperado 0 alertas, got %d: %+v", len(alertas), alertas)
	}
}

// TestBuildAlerts_ContaDesconectadaGeraCritical verifica que conta primary/backup
// desconectada (quarentena/banida) gera alerta critical na área "Contas WA".
func TestBuildAlerts_ContaDesconectadaGeraCritical(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:     0,
		ActiveWorkers:  2,
		CircuitBreaker: map[string]string{},
		ContasWA: ContasWAStatus{
			Total:             3,
			PrimaryConectadas: 1,
			BackupConectadas:  1,
			Quarentena:        1,
			Desconectadas:     1,
		},
		Scan:   ScanStatus{Rodando: true},
		Janela: JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
	}

	alertas := buildAlerts(snapshot)

	contasCritical := filterAlerts(alertas, "critical", "Contas WA")
	// Critério V: pelo menos 1 alerta critical em "Contas WA".
	if len(contasCritical) == 0 {
		t.Error("esperado alerta critical em 'Contas WA', nenhum encontrado")
	}
	// Critério F: alerta deve mencionar ação de reconexão.
	for _, a := range contasCritical {
		if !strings.Contains(a.Action, "Reconecte") {
			t.Errorf("action esperada conter 'Reconecte', got: %q", a.Action)
		}
	}
}

// TestBuildAlerts_ScanParadoGeraWarning verifica que scan sem coleta recente gera warning.
func TestBuildAlerts_ScanParadoGeraWarning(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:     0,
		ActiveWorkers:  1,
		CircuitBreaker: map[string]string{},
		ContasWA:       ContasWAStatus{Total: 1, PrimaryConectadas: 1},
		Scan: ScanStatus{
			Rodando:            false, // scan parado
			MarketplacesAtivos: 1,
		},
		Janela: JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
	}

	alertas := buildAlerts(snapshot)

	scanWarnings := filterAlerts(alertas, "warning", "Scan")
	// Critério V: pelo menos 1 warning de scan.
	if len(scanWarnings) == 0 {
		t.Error("esperado alerta warning em 'Scan', nenhum encontrado")
	}
}

// TestBuildAlerts_GruposSemContaGeraWarning verifica o alerta de grupos ativos
// sem conta vinculada (não disparam — gate HasModem do tick).
func TestBuildAlerts_GruposSemContaGeraWarning(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:           0,
		ActiveWorkers:        1,
		CircuitBreaker:       map[string]string{},
		ContasWA:             ContasWAStatus{Total: 1, PrimaryConectadas: 1},
		Scan:                 ScanStatus{Rodando: true, MarketplacesAtivos: 1},
		Janela:               JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
		GruposAtivosSemConta: 3,
	}

	alertas := buildAlerts(snapshot)

	got := filterAlerts(alertas, "warning", "Distribuição")
	if len(got) == 0 {
		t.Error("esperado warning em 'Distribuição' para grupos sem conta, nenhum encontrado")
	}
}

// TestBuildAlerts_FilaTravadaGeraCritical verifica a regra queue_depth>0 + active_workers==0.
func TestBuildAlerts_FilaTravadaGeraCritical(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:     5, // mensagens esperando
		ActiveWorkers:  0, // nenhum worker
		CircuitBreaker: map[string]string{},
		ContasWA:       ContasWAStatus{Total: 1, PrimaryConectadas: 1},
		Scan:           ScanStatus{Rodando: true},
		Janela:         JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
	}

	alertas := buildAlerts(snapshot)

	filaCriticals := filterAlerts(alertas, "critical", "Fila")
	// Critério V: fila travada → critical.
	if len(filaCriticals) == 0 {
		t.Error("esperado alerta critical em 'Fila', nenhum encontrado")
	}
	for _, a := range filaCriticals {
		if !strings.Contains(a.Message, "queue_depth") {
			t.Errorf("message deve conter 'queue_depth', got: %q", a.Message)
		}
	}
}

// TestBuildAlerts_FilaSemWorkersNaoDisparaComFilaVazia verifica que
// active_workers==0 sem queue_depth não gera alerta de fila travada.
func TestBuildAlerts_FilaSemWorkersNaoDisparaComFilaVazia(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:     0, // fila vazia — worker parado é OK
		ActiveWorkers:  0,
		CircuitBreaker: map[string]string{},
		ContasWA:       ContasWAStatus{Total: 1, PrimaryConectadas: 1},
		Scan:           ScanStatus{Rodando: true},
		Janela:         JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
	}

	alertas := buildAlerts(snapshot)

	filaCriticals := filterAlerts(alertas, "critical", "Fila")
	// Critério F: fila vazia + workers inativos não é crítico.
	if len(filaCriticals) != 0 {
		t.Errorf("esperado 0 alertas de 'Fila' com queue vazia, got %d", len(filaCriticals))
	}
}

// TestBuildAlerts_CircuitBreakerAbertoGeraCritical verifica upstream com state=open.
func TestBuildAlerts_CircuitBreakerAbertoGeraCritical(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:    0,
		ActiveWorkers: 2,
		CircuitBreaker: map[string]string{
			"evolution": "open",   // aberto — dispara alerta
			"telegram":  "closed", // fechado — não dispara
		},
		ContasWA: ContasWAStatus{Total: 1, PrimaryConectadas: 1},
		Scan:     ScanStatus{Rodando: true},
		Janela:   JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
	}

	alertas := buildAlerts(snapshot)

	cbCriticals := filterAlerts(alertas, "critical", "Circuit Breaker")
	// Critério V: 1 circuit breaker aberto → 1 alerta critical.
	if len(cbCriticals) != 1 {
		t.Errorf("esperado 1 alerta critical de 'Circuit Breaker', got %d", len(cbCriticals))
	}
	if !strings.Contains(cbCriticals[0].Message, "evolution") {
		t.Errorf("alerta deve mencionar upstream 'evolution', got: %q", cbCriticals[0].Message)
	}
}

// TestBuildAlerts_DoisCircuitBreakersAbertosGeramDoisAlertas verifica múltiplos upstreams abertos.
func TestBuildAlerts_DoisCircuitBreakersAbertosGeramDoisAlertas(t *testing.T) {
	snapshot := HealthSnapshot{
		QueueDepth:    0,
		ActiveWorkers: 1,
		CircuitBreaker: map[string]string{
			"evolution": "open",
			"telegram":  "open",
		},
		ContasWA: ContasWAStatus{Total: 1, PrimaryConectadas: 1},
		Scan:     ScanStatus{Rodando: true},
		Janela:   JanelaStatus{Aberta: true, SendStartHour: 8, SendEndHour: 22},
	}

	alertas := buildAlerts(snapshot)

	cbCriticals := filterAlerts(alertas, "critical", "Circuit Breaker")
	// Critério V: 2 upstreams abertos → 2 alertas.
	if len(cbCriticals) != 2 {
		t.Errorf("esperado 2 alertas de 'Circuit Breaker', got %d", len(cbCriticals))
	}
}

// TestBuildAlerts_AlertaRetornaSliceVazioNaoNil garante que buildAlerts nunca retorna nil.
// Alerta nil causaria JSON `null` em vez de `[]` no endpoint.
func TestBuildAlerts_AlertaRetornaSliceVazioNaoNil(t *testing.T) {
	snapshot := HealthSnapshot{
		CircuitBreaker: map[string]string{},
		Scan:           ScanStatus{Rodando: true},
		Janela:         JanelaStatus{Aberta: true},
	}

	alertas := buildAlerts(snapshot)

	// Critério V: nunca nil — sempre slice inicializado.
	if alertas == nil {
		t.Error("buildAlerts retornou nil — deve retornar slice vazio []Alerta{}")
	}
}

// filterAlerts filtra alertas por severity e area.
func filterAlerts(alertas []Alerta, severity, area string) []Alerta {
	result := []Alerta{}
	for _, a := range alertas {
		if a.Severity == severity && a.Area == area {
			result = append(result, a)
		}
	}
	return result
}
