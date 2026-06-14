package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"snatcher/backendv2/internal/services/sendwindow"

	"github.com/jmoiron/sqlx"
)

// HealthFullResponse agrega todos os subsistemas do Snatcher num único payload.
// Embute HealthResponse (dispatcher, circuit_breaker, llm, catalog) e adiciona
// contas WA, estado do scan, janela de envio e alertas acionáveis.
type HealthFullResponse struct {
	HealthResponse

	ContasWA ContasWAStatus  `json:"contas_wa"`
	Scan     ScanStatus      `json:"scan"`
	Janela   JanelaStatus    `json:"janela"`
	Alertas  []Alerta        `json:"alertas"`
}

// ContasWAStatus resume as contas WhatsApp por estado operacional.
type ContasWAStatus struct {
	Total              int `json:"total"`
	PrimaryConectadas  int `json:"primary_conectadas"`
	BackupConectadas   int `json:"backup_conectadas"`
	Quarentena         int `json:"quarentena"`
	Desconectadas      int `json:"desconectadas"`
}

// ScanStatus resume o estado do scraper/coletor.
type ScanStatus struct {
	Rodando           bool    `json:"rodando"`
	UltimaColeta      *string `json:"ultima_coleta"`
	MarketplacesAtivos int    `json:"marketplaces_ativos"`
}

// JanelaStatus informa se a janela de envio está aberta agora.
type JanelaStatus struct {
	Aberta         bool `json:"aberta"`
	SendStartHour  int  `json:"send_start_hour"`
	SendEndHour    int  `json:"send_end_hour"`
}

// Alerta representa um problema detectado com severidade e ação sugerida.
type Alerta struct {
	Severity string `json:"severity"` // critical | warning | info
	Area     string `json:"area"`
	Message  string `json:"message"`
	Action   string `json:"action"`
}

// SystemHealthFullHandler retorna o estado agregado de TODOS os subsistemas
// e gera alertas acionáveis para o operador.
//
// GET /api/admin/health/full
func SystemHealthFullHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Subsistemas base reutilizados do endpoint /api/admin/health existente.
		base := buildHealthResponse(db, ctx)

		contasWA := fetchContasWAStatus(db, ctx)
		scan := fetchScanStatus(db, ctx)
		janela := fetchJanelaStatus(db, ctx)

		// Snapshot imutável entregue ao motor de alertas (função pura, testável).
		snapshot := HealthSnapshot{
			QueueDepth:           extractInt(base.Dispatcher, "queue_depth"),
			ActiveWorkers:        extractInt(base.Dispatcher, "active_workers"),
			CircuitBreaker:       base.CircuitBreaker,
			ContasWA:             contasWA,
			Scan:                 scan,
			Janela:               janela,
			GruposAtivosSemConta: fetchGruposAtivosSemConta(db, ctx),
		}

		resp := HealthFullResponse{
			HealthResponse: base,
			ContasWA:       contasWA,
			Scan:           scan,
			Janela:         janela,
			Alertas:        buildAlerts(snapshot),
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// HealthSnapshot é uma cópia plana do estado do sistema passada ao motor de alertas.
// Contém apenas valores escalares — sem referências ao DB — para facilitar testes unitários.
type HealthSnapshot struct {
	QueueDepth     int
	ActiveWorkers  int
	CircuitBreaker map[string]string
	ContasWA       ContasWAStatus
	Scan           ScanStatus
	Janela         JanelaStatus
	// GruposAtivosSemConta: grupos status=active que NÃO têm conta primary/backup
	// vinculada via group_admins — o tick não dispara neles (gate HasModem).
	GruposAtivosSemConta int
}

// buildAlerts aplica as regras de alerta sobre o snapshot e retorna a lista de alertas.
// Função pura (sem I/O): recebe dados já coletados, retorna alertas. Fácil de testar.
func buildAlerts(s HealthSnapshot) []Alerta {
	alertas := []Alerta{}

	// Contas WA: qualquer primary ou backup desconectada (status quarentena/banida) é critical.
	// "Desconectadas" representa contas em quarentena que estão efetivamente fora de operação.
	if s.ContasWA.Desconectadas > 0 {
		alertas = append(alertas, Alerta{
			Severity: "critical",
			Area:     "Contas WA",
			Message:  formatAlertMsg("%d conta(s) primary/backup fora de operação", s.ContasWA.Desconectadas),
			Action:   "Reconecte em Distribuição › Modems",
		})
	}

	// Scan parado: scraper sem coleta recente (mv_scraper_health computed_at > 2h).
	if !s.Scan.Rodando {
		alertas = append(alertas, Alerta{
			Severity: "warning",
			Area:     "Scan",
			Message:  "Scraper sem coleta recente (> 2h)",
			Action:   "Verifique o scheduler em Admin › Scan",
		})
	}

	// Fila travada: há mensagens pendentes mas nenhum worker ativo.
	if s.QueueDepth > 0 && s.ActiveWorkers == 0 {
		alertas = append(alertas, Alerta{
			Severity: "critical",
			Area:     "Fila",
			Message:  formatAlertMsg("queue_depth=%d mas active_workers=0 — dispatcher travado", s.QueueDepth),
			Action:   "Reinicie o worker de envio via Admin › Danger",
		})
	}

	// Circuit breaker aberto para qualquer upstream.
	for upstream, state := range s.CircuitBreaker {
		if state == "open" {
			alertas = append(alertas, Alerta{
				Severity: "critical",
				Area:     "Circuit Breaker",
				Message:  formatAlertMsg("upstream %q com circuit breaker aberto", upstream),
				Action:   "Verifique conectividade com " + upstream,
			})
		}
	}

	// Grupos ativos que não disparam: status=active mas sem conta primary/backup
	// vinculada (gate HasModem do selection.tick). Surface direto do "por que nada
	// dispara" — operador atua vinculando conta/importando grupo real.
	if s.GruposAtivosSemConta > 0 {
		alertas = append(alertas, Alerta{
			Severity: "warning",
			Area:     "Distribuição",
			Message:  formatAlertMsg("%d grupo(s) ativo(s) sem conta WhatsApp vinculada — não disparam automaticamente", s.GruposAtivosSemConta),
			Action:   "Vincule uma conta/importe o grupo real em Distribuição › Modems",
		})
	}

	// Marketplace em uso (com produtos send_ready) sem programa de afiliado ativo.
	// TODO: requer normalizar nomes de marketplace (catalog usa 'amz', affiliate_programs
	// usa 'amazon') antes de joinar — senão gera falso-positivo. Follow-up.

	// Janela fechada em horário comercial (8h-22h BRT).
	if !s.Janela.Aberta {
		now := time.Now()
		// Hora BRT aproximada: UTC-3.
		hourBRT := (now.UTC().Hour() + 21) % 24
		if hourBRT >= 8 && hourBRT < 22 {
			alertas = append(alertas, Alerta{
				Severity: "info",
				Area:     "Janela de Envio",
				Message:  "Janela de envio fechada em horário comercial (8h-22h BRT)",
				Action:   "Ajuste send_start_hour/send_end_hour em Configurações",
			})
		}
	}

	return alertas
}

// formatAlertMsg formata uma mensagem de alerta com fmt.Sprintf.
// Wrapper criado apenas para deixar buildAlerts mais legível como função pura.
func formatAlertMsg(format string, args ...any) string {
	return fmt.Sprintf(format, args...)
}

// fetchContasWAStatus consulta a tabela accounts e retorna o resumo por status.
// Usa os campos status='primary'|'backup'|'quarantine'|'banned' da tabela accounts.
// "Desconectadas" = primary+backup em quarentena/banidas (efetivamente sem capacidade de envio).
func fetchContasWAStatus(db *sqlx.DB, ctx context.Context) ContasWAStatus {
	type statusRow struct {
		Status string `db:"status"`
		Count  int    `db:"n"`
	}

	var rows []statusRow
	_ = db.SelectContext(ctx, &rows, `
		SELECT status, COUNT(*) AS n
		FROM accounts
		GROUP BY status
	`)

	result := ContasWAStatus{}
	for _, row := range rows {
		result.Total += row.Count
		switch row.Status {
		case "primary":
			result.PrimaryConectadas += row.Count
		case "backup":
			result.BackupConectadas += row.Count
		case "quarantine", "banned":
			result.Quarentena += row.Count
			result.Desconectadas += row.Count
		}
	}

	return result
}

// scanHealthRow mapeia uma linha de mv_scraper_health para verificar última coleta.
type scanHealthRow struct {
	ComputedAt string `db:"computed_at"`
}

// fetchScanStatus verifica mv_scraper_health para determinar se o scan está ativo.
// Considera "parado" quando não há coleta nos últimos 2h (2× o intervalo padrão de 1h da MV).
func fetchScanStatus(db *sqlx.DB, ctx context.Context) ScanStatus {
	result := ScanStatus{}

	// Busca a coleta mais recente da materialized view.
	var row scanHealthRow
	err := db.GetContext(ctx, &row, `
		SELECT computed_at::text AS computed_at
		FROM mv_scraper_health
		ORDER BY computed_at DESC
		LIMIT 1
	`)
	if err != nil {
		// Sem dados na MV = nenhuma coleta registrada.
		result.Rodando = false
		return result
	}

	result.UltimaColeta = &row.ComputedAt

	// Parsear o timestamp para verificar se é recente (< 2h).
	parsed, err := time.Parse("2006-01-02T15:04:05", row.ComputedAt)
	if err != nil {
		// Fallback: tentar com fuso.
		parsed, err = time.Parse("2006-01-02T15:04:05-07:00", row.ComputedAt)
	}
	if err == nil {
		result.Rodando = time.Since(parsed) < 2*time.Hour
	}

	// Conta marketplaces ativos (sources com enabled=true que têm catalog items).
	var marketplacesAtivos int
	_ = db.GetContext(ctx, &marketplacesAtivos, `
		SELECT COUNT(DISTINCT c.source_id)
		FROM catalog c
		JOIN sources s ON s.id = c.source_id
		WHERE s.enabled = true
		  AND c.send_ready = true
	`)
	result.MarketplacesAtivos = marketplacesAtivos

	return result
}

// janelaConfigRow mapeia os campos de janela de envio do appconfig.
type janelaConfigRow struct {
	SendStartHour int `db:"send_start_hour"`
	SendEndHour   int `db:"send_end_hour"`
}

// fetchJanelaStatus lê appconfig e usa sendwindow.InSendWindow para o estado atual.
func fetchJanelaStatus(db *sqlx.DB, ctx context.Context) JanelaStatus {
	result := JanelaStatus{}

	var cfg janelaConfigRow
	if err := db.GetContext(ctx, &cfg, `
		SELECT send_start_hour, send_end_hour
		FROM appconfig
		LIMIT 1
	`); err != nil {
		return result
	}

	result.SendStartHour = cfg.SendStartHour
	result.SendEndHour = cfg.SendEndHour
	result.Aberta = sendwindow.InSendWindow(ctx, db)

	return result
}

// fetchGruposAtivosSemConta conta grupos status=active que NÃO têm conta
// primary/backup vinculada via group_admins — espelha o gate HasModem do
// selection.tick (grupo sem conta nunca dispara automaticamente).
func fetchGruposAtivosSemConta(db *sqlx.DB, ctx context.Context) int {
	var n int
	_ = db.GetContext(ctx, &n, `
		SELECT COUNT(*)
		FROM groups g
		WHERE g.status = 'active'
		  AND NOT EXISTS (
			SELECT 1
			FROM group_admins ga
			JOIN accounts a ON a.id = ga.account_id
			WHERE ga.group_id = g.id
			  AND a.status IN ('primary', 'backup')
		  )
	`)
	return n
}

// extractInt extrai um int de um mapa interface{} retornando 0 se ausente ou tipo errado.
func extractInt(m map[string]interface{}, key string) int {
	if m == nil {
		return 0
	}
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch typed := v.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	}
	return 0
}

