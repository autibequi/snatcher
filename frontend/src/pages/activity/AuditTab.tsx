import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetchJSON } from '../../lib/authFetch'

interface AuditEvent {
  event_type: 'llm_action' | 'system_pause' | 'ban_event'
  title: string
  detail: string
  evaluation?: string
  at: string
}

interface AuditStats {
  llm_actions: number
  llm_success: number
  llm_rollback: number
  system_pauses: number
  ban_events: number
}

const TYPE_CFG = {
  llm_action:   { label: 'Ação LLM',      cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  system_pause: { label: 'Pausa sistema',  cls: 'bg-warning-soft text-warning border-warning/30' },
  ban_event:    { label: 'Ban detectado',  cls: 'bg-danger-soft text-danger border-danger/30' },
} as const

function humanize(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? `ontem ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : `há ${d}d`
}

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_CFG[type as keyof typeof TYPE_CFG] ?? { label: type, cls: 'bg-surface-2 text-fg-3 border-border' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  )
}

function EvalBadge({ ev }: { ev?: string }) {
  if (!ev) return <span className="text-fg-3 text-xs">—</span>
  if (ev === 'success')  return <span className="text-success text-xs font-medium">✓ sucesso</span>
  if (ev === 'rollback') return <span className="text-warning text-xs font-medium">↶ revertido</span>
  return <span className="text-fg-2 text-xs">{ev}</span>
}

export function AuditTab({ q, status }: { q?: string; status?: string }) {
  const [days, setDays] = useState(7)

  const { data: timeline = [], isLoading: loadingTL } = useQuery<AuditEvent[]>({
    queryKey: ['audit-timeline', days],
    queryFn: () => authFetchJSON(`/api/admin/audit/timeline?days=${days}`, []),
    staleTime: 60_000,
  })

  const { data: stats } = useQuery<AuditStats>({
    queryKey: ['audit-stats', days],
    queryFn: () => authFetchJSON(`/api/admin/audit/stats?days=${days}`, {
      llm_actions: 0, llm_success: 0, llm_rollback: 0, system_pauses: 0, ban_events: 0,
    }),
    staleTime: 60_000,
  })

  const filtered = timeline.filter(ev => {
    if (status && ev.event_type !== status) return false
    if (q) {
      const lq = q.toLowerCase()
      if (!ev.title.toLowerCase().includes(lq) && !ev.detail.toLowerCase().includes(lq)) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Controles locais da aba */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg focus:outline-none focus:border-accent"
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <span className="text-xs text-fg-3 ml-auto">{filtered.length} eventos</span>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Ações LLM',     value: stats.llm_actions,   color: '' },
            { label: 'Sucesso',       value: stats.llm_success,   color: 'text-success' },
            { label: 'Revertidas',    value: stats.llm_rollback,  color: 'text-warning' },
            { label: 'Pausas',        value: stats.system_pauses, color: 'text-warning' },
            { label: 'Bans',          value: stats.ban_events,    color: 'text-danger' },
          ].map(k => (
            <div key={k.label} className="bg-surface-2 rounded-lg p-3 flex flex-col gap-0.5">
              <p className="text-[10px] uppercase tracking-wider text-fg-3">{k.label}</p>
              <p className={`text-lg font-semibold ${k.color || 'text-fg'}`}>{k.value.toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {loadingTL && <p className="text-fg-3 text-sm py-6">Carregando...</p>}

      {!loadingTL && filtered.length === 0 && (
        <p className="text-sm text-fg-3 py-8 text-center">Nenhum evento no período.</p>
      )}

      {!loadingTL && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 border-b border-border text-fg-3 text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Quando</th>
                <th className="px-4 py-2.5 font-medium">Tipo</th>
                <th className="px-4 py-2.5 font-medium">Título</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Detalhe</th>
                <th className="px-4 py-2.5 font-medium">Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-fg-3 text-xs whitespace-nowrap">{humanize(ev.at)}</td>
                  <td className="px-4 py-2.5"><TypeBadge type={ev.event_type} /></td>
                  <td className="px-4 py-2.5 text-fg text-xs max-w-xs">
                    <span title={ev.title} className="line-clamp-2">{ev.title}</span>
                  </td>
                  <td className="px-4 py-2.5 text-fg-2 text-xs max-w-sm hidden md:table-cell">
                    <span title={ev.detail} className="line-clamp-2">{ev.detail}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><EvalBadge ev={ev.evaluation} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
