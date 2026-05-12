import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'

const ALL_LOOPS = [
  'taxonomy_grow',
  'scraper_fix',
  'template_ab',
  'anomaly_pause',
  'affinity_adjust',
  'cooldown_suggest',
  'cap_suggest',
  'auto_tuning',
  'content_optimize',
]

interface LoopStatus {
  loop_name: string
  status: 'active' | 'suggesting' | 'disabled'
  strikes_30d: number
  last_strike_at?: string
  actions_last_7d: number
  suggestions_open: number
}

interface LoopAction {
  id: number
  action_type: string
  target_table: string
  target_id?: number
  reasoning?: string
  confidence?: number
  evaluation?: string
  applied_at: string
}

function humanize(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'suggesting'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

export default function AdminLoops() {
  const [loops, setLoops] = useState<LoopStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [actions, setActions] = useState<Record<string, LoopAction[]>>({})
  const [actionsLoading, setActionsLoading] = useState<Record<string, boolean>>({})

  const load = async () => {
    setLoading(true)
    try {
      const r = await authFetch('/api/admin/loops/status')
      const data = await r.json()
      setLoops(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleExpand = async (loopName: string) => {
    const next = !expanded[loopName]
    setExpanded(prev => ({ ...prev, [loopName]: next }))
    if (next && !actions[loopName]) {
      setActionsLoading(prev => ({ ...prev, [loopName]: true }))
      try {
        const r = await authFetch(`/api/admin/loops/${loopName}/actions?days=7`)
        const data = await r.json()
        setActions(prev => ({ ...prev, [loopName]: data || [] }))
      } finally {
        setActionsLoading(prev => ({ ...prev, [loopName]: false }))
      }
    }
  }

  const setStatus = async (loopName: string, status: string) => {
    if (status === 'disabled' || status === 'suggesting') {
      const verb = status === 'disabled' ? 'DESABILITAR' : 'colocar em modo sugestão'
      if (!window.confirm(`Confirmar: ${verb} o loop "${loopName}"?`)) return
    }
    await authFetch(`/api/admin/loops/${loopName}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setActions(prev => { const n = { ...prev }; delete n[loopName]; return n })
    load()
  }

  const resetStrikes = async (loopName: string) => {
    if (!window.confirm(`Zerar strikes do loop "${loopName}"?`)) return
    await authFetch(`/api/admin/loops/${loopName}/reset_strikes`, { method: 'POST' })
    load()
  }

  // Merge server data with known loops list (to show all 9 even if DB is empty)
  const statusMap = Object.fromEntries(loops.map(l => [l.loop_name, l]))
  const rows: LoopStatus[] = ALL_LOOPS.map(
    name =>
      statusMap[name] ?? {
        loop_name: name,
        status: 'disabled' as const,
        strikes_30d: 0,
        actions_last_7d: 0,
        suggestions_open: 0,
      }
  )

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-2">Loops LLM ({ALL_LOOPS.length})</h1>

      <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        Estes {ALL_LOOPS.length} loops ajustam o snatcher de forma autônoma.{' '}
        <strong>active</strong> = aplica direto.{' '}
        <strong>suggesting</strong> = só publica em /suggestions-l4.{' '}
        <strong>disabled</strong> = no-op.
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && (
        <div className="space-y-3">
          {rows.map(loop => (
            <div key={loop.loop_name} className="bg-white border rounded-lg p-4 shadow-sm">
              {/* Main row */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-semibold w-44 flex-shrink-0">
                  {loop.loop_name}
                </span>
                <StatusBadge status={loop.status} />
                <span className="text-sm text-gray-600">
                  Strikes 30d:{' '}
                  <strong className={loop.strikes_30d > 0 ? 'text-red-600' : ''}>
                    {loop.strikes_30d}
                  </strong>
                </span>
                <span className="text-sm text-gray-600">
                  Ações 7d: <strong>{loop.actions_last_7d}</strong>
                </span>
                <span className="text-sm text-gray-600">
                  Sugestões: <strong>{loop.suggestions_open}</strong>
                </span>
                <span className="text-xs text-gray-400">
                  Última strike: {humanize(loop.last_strike_at)}
                </span>

                {/* Actions */}
                <div className="flex flex-wrap gap-1 ml-auto">
                  <button
                    onClick={() => toggleExpand(loop.loop_name)}
                    className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded font-medium"
                  >
                    {expanded[loop.loop_name] ? 'Ocultar ações' : 'Ver ações'}
                  </button>
                  <button
                    onClick={() => resetStrikes(loop.loop_name)}
                    className="px-3 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 rounded font-medium"
                  >
                    Reset strikes
                  </button>
                  {loop.status !== 'active' && (
                    <button
                      onClick={() => setStatus(loop.loop_name, 'active')}
                      className="px-3 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-800 rounded font-medium"
                    >
                      Set Active
                    </button>
                  )}
                  {loop.status !== 'suggesting' && (
                    <button
                      onClick={() => setStatus(loop.loop_name, 'suggesting')}
                      className="px-3 py-1 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded font-medium"
                    >
                      Set Suggesting
                    </button>
                  )}
                  {loop.status !== 'disabled' && (
                    <button
                      onClick={() => setStatus(loop.loop_name, 'disabled')}
                      className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-800 rounded font-medium"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded actions table */}
              {expanded[loop.loop_name] && (
                <div className="mt-4 border-t pt-3">
                  {actionsLoading[loop.loop_name] && (
                    <p className="text-sm text-gray-500">Carregando ações...</p>
                  )}
                  {!actionsLoading[loop.loop_name] && (
                    <>
                      {(!actions[loop.loop_name] || actions[loop.loop_name].length === 0) ? (
                        <p className="text-sm text-gray-400">Nenhuma ação nos últimos 7 dias.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50 text-gray-600 text-left">
                                <th className="px-2 py-1 font-medium">Tipo</th>
                                <th className="px-2 py-1 font-medium">Tabela</th>
                                <th className="px-2 py-1 font-medium">ID</th>
                                <th className="px-2 py-1 font-medium">Reasoning</th>
                                <th className="px-2 py-1 font-medium">Avaliação</th>
                                <th className="px-2 py-1 font-medium">Aplicado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {actions[loop.loop_name].map(a => (
                                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="px-2 py-1 font-mono">{a.action_type}</td>
                                  <td className="px-2 py-1 text-gray-600">{a.target_table}</td>
                                  <td className="px-2 py-1 text-gray-500">{a.target_id ?? '—'}</td>
                                  <td className="px-2 py-1 text-gray-600 max-w-xs truncate" title={a.reasoning}>
                                    {a.reasoning ?? '—'}
                                  </td>
                                  <td className="px-2 py-1 text-gray-600">{a.evaluation ?? '—'}</td>
                                  <td className="px-2 py-1 text-gray-400 whitespace-nowrap">
                                    {humanize(a.applied_at)}
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
