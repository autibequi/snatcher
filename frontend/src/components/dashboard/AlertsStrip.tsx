import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, ArrowRight } from '../../lib/icons'
import type { Alerta } from '../../lib/api/health'

// ── Helpers ───────────────────────────────────────────────────────────────────

// severityOrder mapeia severity para peso de ordenação (menor = mais urgente).
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

// alertNavTarget infere a rota de destino a partir do campo action do alerta.
// Retorna undefined se não conseguir inferir rota navegável.
function alertNavTarget(action: string): string | undefined {
  const lower = action.toLowerCase()
  if (lower.includes('scraper') || lower.includes('scheduler') || lower.includes('análise') || lower.includes('analise')) {
    return '/admin/scrapers'
  }
  if (lower.includes('modem') || lower.includes('sender') || lower.includes('distribuição') || lower.includes('distribuicao')) {
    return '/admin/senders'
  }
  if (lower.includes('worker') || lower.includes('dispatcher') || lower.includes('fila')) {
    return '/admin/health'
  }
  if (lower.includes('conta') || lower.includes('whatsapp') || lower.includes('wa')) {
    return '/admin/senders'
  }
  if (lower.includes('afiliado')) {
    return '/affiliates'
  }
  if (lower.includes('configurações') || lower.includes('configuracoes')) {
    return '/settings'
  }
  return undefined
}

// alertClasses retorna as classes CSS para o container do alerta por severidade.
function alertClasses(severity: string): string {
  if (severity === 'critical') {
    return 'bg-danger/10 border-danger/30 text-danger'
  }
  if (severity === 'warning') {
    return 'bg-warning/10 border-warning/30 text-warning'
  }
  return 'bg-surface-2 border-border text-fg-3'
}

// alertIconClasses retorna classes de cor para o ícone do alerta.
function alertIconClasses(severity: string): string {
  if (severity === 'critical') return 'text-danger'
  if (severity === 'warning') return 'text-warning'
  return 'text-fg-3'
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface AlertsStripProps {
  items: Alerta[]
}

// ── Component ─────────────────────────────────────────────────────────────────

// AlertsStrip renderiza a faixa de alertas do painel de saúde.
// Ordenado por severidade: critical → warning → info.
// Se vazio, exibe faixa verde "Tudo operando".
export function AlertsStrip({ items }: AlertsStripProps) {
  const navigate = useNavigate()

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
        <span className="text-sm font-medium text-success">Tudo operando — nenhum alerta ativo</span>
      </div>
    )
  }

  const sorted = [...items].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
  )

  return (
    <div className="space-y-2">
      {sorted.map((alerta, idx) => {
        const navTarget = alertNavTarget(alerta.action)
        return (
          <div
            key={idx}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${alertClasses(alerta.severity)}`}
          >
            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${alertIconClasses(alerta.severity)}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <span className="text-sm font-medium">{alerta.message}</span>
              </div>
              {alerta.action && (
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                  onClick={() => {
                    if (navTarget) navigate(navTarget)
                  }}
                  style={navTarget ? undefined : { cursor: 'default' }}
                >
                  {alerta.action}
                  {navTarget && <ArrowRight className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
