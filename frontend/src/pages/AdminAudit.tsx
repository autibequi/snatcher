import { useState, useEffect } from 'react'
import { authFetch } from '../lib/authFetch'

// ---------- types ----------

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

// ---------- helpers ----------

function humanize(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `ha ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `ha ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `ha ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) {
    const t = new Date(iso)
    const hh = t.getHours().toString().padStart(2, '0')
    const mm = t.getMinutes().toString().padStart(2, '0')
    return `ontem ${hh}:${mm}`
  }
  return `ha ${d}d`
}

function truncate(s: string, n = 100): string {
  return s.length > n ? s.slice(0, n) + '...' : s
}

// ---------- sub-components ----------

function KpiCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-1 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-fg-3">{label}</p>
      <p className={`text-xl font-semibold truncate ${color ?? 'text-fg'}`}>
        {value.toLocaleString('pt-BR')}
      </p>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    llm_action:   { label: 'LLM Action',    cls: 'bg-blue-900/50 text-blue-300 border-blue-700' },
    system_pause: { label: 'System Pause',  cls: 'bg-warning/20 text-warning border-warning/30' },
    ban_event:    { label: 'Ban Event',     cls: 'bg-danger/20 text-danger border-danger/30' },
  }
  const c = cfg[type] ?? { label: type, cls: 'bg-surface-2 text-fg-3 border-border' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  )
}

function EvalBadge({ eval: ev }: { eval?: string }) {
  if (!ev) return <span className="text-fg-3">—</span>
  if (ev === 'success')  return <span className="text-success font-medium">&#10003; success</span>
  if (ev === 'rollback') return <span className="text-orange-400 font-medium">&#8617; rollback</span>
  return <span className="text-warning font-medium">&#9203; {ev}</span>
}

// ---------- main ----------

export default function AdminAudit() {
  const [days, setDays] = useState(7)
  const [timeline, setTimeline] = useState<AuditEvent[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Client-side type filter
  const [showLLM, setShowLLM] = useState(true)
  const [showPause, setShowPause] = useState(true)
  const [showBan, setShowBan] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      authFetch(`/api/admin/audit/timeline?days=${days}`).then(r => r.json()),
      authFetch(`/api/admin/audit/stats?days=${days}`).then(r => r.json()),
    ])
      .then(([tl, st]) => {
        setTimeline(Array.isArray(tl) ? tl : [])
        setStats(st && typeof st === 'object' ? (st as AuditStats) : null)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [days])

  const filtered = timeline.filter(ev => {
    if (ev.event_type === 'llm_action'   && !showLLM)   return false
    if (ev.event_type === 'system_pause' && !showPause) return false
    if (ev.event_type === 'ban_event'    && !showBan)   return false
    return true
  })

  return (
    <div className="p-4 md:mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-fg">Audit Timeline</h1>
          <p className="text-sm text-fg-3 mt-0.5">O que o sistema fez sozinho — acoes autonomas consolidadas</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-surface-2 border border-border text-fg text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value={7}>Ultimos 7 dias</option>
          <option value={30}>Ultimos 30 dias</option>
          <option value={90}>Ultimos 90 dias</option>
        </select>
      </div>

      {error && (
        <div className="bg-danger/20 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">
          Erro ao carregar dados: {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !error && stats && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="LLM Actions" value={stats.llm_actions} />
            <KpiCard label="Success" value={stats.llm_success} color="text-success" />
            <KpiCard label="Rollback" value={stats.llm_rollback} color="text-orange-400" />
            <KpiCard label="System Pauses" value={stats.system_pauses} color="text-warning" />
            <KpiCard label="Ban Events" value={stats.ban_events} color="text-danger" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 text-sm text-fg-2">
            <span className="text-fg-3 text-xs uppercase tracking-wider">Filtrar:</span>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLLM}
                onChange={e => setShowLLM(e.target.checked)}
                className="accent-blue-500"
              />
              LLM Actions
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPause}
                onChange={e => setShowPause(e.target.checked)}
                className="accent-yellow-500"
              />
              System Pauses
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBan}
                onChange={e => setShowBan(e.target.checked)}
                className="accent-red-500"
              />
              Ban Events
            </label>
            <span className="ml-auto text-fg-3 text-xs">{filtered.length} eventos</span>
          </div>

          {/* Timeline table */}
          {filtered.length === 0 ? (
            <p className="text-sm text-fg-3 py-8 text-center">Nenhum evento no periodo selecionado.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Quando</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Titulo</th>
                    <th className="px-4 py-2.5 font-medium">Detalhe</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Avaliacao</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ev, i) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="px-4 py-2 font-mono text-fg-3 text-xs whitespace-nowrap">
                        {humanize(ev.at)}
                      </td>
                      <td className="px-4 py-2">
                        <TypeBadge type={ev.event_type} />
                      </td>
                      <td className="px-4 py-2 font-mono text-fg text-xs max-w-xs">
                        <span title={ev.title}>{truncate(ev.title, 60)}</span>
                      </td>
                      <td className="px-4 py-2 text-fg-2 text-xs max-w-sm">
                        <span title={ev.detail}>{truncate(ev.detail)}</span>
                      </td>
                      <td className="px-4 py-2 text-xs whitespace-nowrap">
                        <EvalBadge eval={ev.evaluation} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
