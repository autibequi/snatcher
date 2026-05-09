import React from 'react'

export interface JonfreyAction {
  id: number
  action_type: string
  target?: string | null
  status: string
  reasoning?: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  error_message?: string | null
  triggered_by: string
  created_at: string
  finished_at?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-fg-3/10 text-fg-3 border-fg-3/30',
  running: 'bg-accent/10 text-accent border-accent/30',
  success: 'bg-success/10 text-success border-success/30',
  failed: 'bg-danger/10 text-danger border-danger/30',
  skipped: 'bg-warning/10 text-warning border-warning/30',
}

export function fmtJonfreyDate(s: string): string {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function primaryJonfreyOutcome(action: JonfreyAction): string {
  const err = action.error_message?.trim()
  if (err) return err
  const r = action.reasoning?.trim()
  if (r) return r
  if (action.status === 'running') return 'Em execução…'
  return '—'
}

export function relJonfreyTime(s: string): string {
  const ms = Date.now() - new Date(s).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

/** Card expansível — auditoria Jonfrey (mesmo visual da página /automations/jonfrey). */
export function JonfreyActionCard({ action }: { action: JonfreyAction }) {
  const [open, setOpen] = React.useState(false)
  const statusCls = STATUS_COLORS[action.status] ?? STATUS_COLORS.pending
  const outcome = primaryJonfreyOutcome(action)

  return (
    <div className="border border-border rounded-md bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-surface-2 transition-colors"
      >
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide flex-shrink-0 ${statusCls}`}>
          {action.status}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-fg font-mono">{action.action_type}</p>
            {action.target && (
              <span className="text-[10px] text-fg-3 font-mono">target={action.target}</span>
            )}
            <span className="text-[10px] text-fg-3 ml-auto">{action.triggered_by}</span>
          </div>
          <p className="text-sm text-fg-2 mt-1 leading-snug line-clamp-4">{outcome}</p>
          <p className="text-[10px] text-fg-3 mt-0.5">
            {fmtJonfreyDate(action.created_at)} · {relJonfreyTime(action.created_at)}
          </p>
        </div>
        <span className="text-fg-3 flex-shrink-0">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface-2 p-3 space-y-2">
          {action.reasoning?.trim() && (
            <div>
              <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Texto completo</p>
              <p className="text-sm text-fg-2 whitespace-pre-wrap">{action.reasoning}</p>
            </div>
          )}
          {action.error_message?.trim() && (
            <div className="bg-danger/5 border border-danger/30 rounded p-2">
              <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Erro</p>
              <p className="text-xs text-danger font-mono whitespace-pre-wrap break-words">{action.error_message}</p>
            </div>
          )}
          <details className="rounded border border-border bg-surface p-2">
            <summary className="cursor-pointer text-[10px] text-fg-3 uppercase tracking-wide select-none">
              Snapshots técnicos (antes / depois)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Antes</p>
                <pre className="text-[10px] bg-surface border border-border rounded p-2 overflow-x-auto font-mono text-fg-2 max-h-48 overflow-y-auto">
                  {JSON.stringify(action.before ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Depois</p>
                <pre className="text-[10px] bg-surface border border-border rounded p-2 overflow-x-auto font-mono text-fg-2 max-h-48 overflow-y-auto">
                  {JSON.stringify(action.after ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
