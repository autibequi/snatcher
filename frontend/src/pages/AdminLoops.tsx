import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'
import { sectionCard, pageContainer } from '../lib/uiTokens'

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

const LOOP_META: Record<string, { label: string; description: string }> = {
  taxonomy_grow:    { label: 'Crescimento de taxonomia', description: 'Sugere novas categorias e marcas com base em produtos recentes sem classificação.' },
  scraper_fix:      { label: 'Correção de scrapers',     description: 'Detecta scrapers com taxa de falha alta e ajusta seletores ou desativa automaticamente.' },
  template_ab:      { label: 'Teste A/B de templates',   description: 'Compara variações de template de mensagem e promove a com maior CTR.' },
  anomaly_pause:    { label: 'Pausa por anomalia',        description: 'Pausa envios de um grupo automaticamente quando detecta sinal anormal (baixo CTR, bans, saturação).' },
  affinity_adjust:  { label: 'Ajuste de afinidade',      description: 'Recalibra o peso de categoria por grupo com base no histórico de cliques e conversões.' },
  cooldown_suggest: { label: 'Sugestão de cooldown',     description: 'Propõe ajuste no intervalo entre envios por modem com base na taxa de ban e na fila.' },
  cap_suggest:      { label: 'Sugestão de cap diário',   description: 'Propõe novo teto de envios por grupo com base na taxa de engajamento recente.' },
  auto_tuning:      { label: 'Auto-tuning',              description: 'Ajusta parâmetros globais do algoritmo (quality_threshold, epsilon) de forma autônoma.' },
  content_optimize: { label: 'Otimização de conteúdo',   description: 'Reescreve templates de mensagem de baixo desempenho usando LLM.' },
}

function loopLabel(name: string) { return LOOP_META[name]?.label ?? name }
function loopDesc(name: string)  { return LOOP_META[name]?.description ?? '' }

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
      ? 'bg-success-soft text-success'
      : status === 'suggesting'
      ? 'bg-warning-soft text-warning'
      : 'bg-surface-2 text-fg-2'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

export default function AdminLoops({ embedded = false }: { embedded?: boolean }) {
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
    <div className={embedded ? 'space-y-3' : pageContainer}>
      {!embedded && <h1 className="text-2xl font-bold mb-2">Loops LLM ({ALL_LOOPS.length})</h1>}

      <p className="text-xs text-fg-3 mb-4">
        Cada loop roda de forma autônoma. <strong className="text-fg-2">Ativo</strong> = aplica direto. <strong className="text-fg-2">Sugestão</strong> = só publica para revisão. <strong className="text-fg-2">Desligado</strong> = no-op.
      </p>

      {loading && <p className="text-fg-3">Carregando...</p>}

      {!loading && (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {rows.map(loop => (
            <div key={loop.loop_name} className="bg-surface px-4 py-3">
              {/* Main row */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <span
                    className="text-sm font-medium text-fg cursor-help"
                    title={loopDesc(loop.loop_name) ? `${loopDesc(loop.loop_name)}\n(${loop.loop_name})` : loop.loop_name}
                  >
                    {loopLabel(loop.loop_name)}
                  </span>
                  <span className="font-mono text-fg-3 text-[10px] ml-2">{loop.loop_name}</span>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 text-xs text-fg-3">
                  {loop.strikes_30d > 0 && (
                    <span className="text-danger font-medium">{loop.strikes_30d} strike{loop.strikes_30d !== 1 ? 's' : ''}</span>
                  )}
                  {loop.actions_last_7d > 0 && (
                    <span>{loop.actions_last_7d} ações/7d</span>
                  )}
                  {loop.suggestions_open > 0 && (
                    <span className="text-warning">{loop.suggestions_open} sugestão{loop.suggestions_open !== 1 ? 'ões' : ''}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={loop.status}
                    onChange={e => setStatus(loop.loop_name, e.target.value)}
                    className="text-xs border border-border rounded px-2 py-1 bg-surface text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="active">Ativo</option>
                    <option value="suggesting">Sugestão</option>
                    <option value="disabled">Desligado</option>
                  </select>
                  <StatusBadge status={loop.status} />
                  <button
                    onClick={() => toggleExpand(loop.loop_name)}
                    className="text-xs text-fg-3 hover:text-fg underline"
                  >
                    {expanded[loop.loop_name] ? 'Fechar' : 'Ações'}
                  </button>
                  {loop.strikes_30d > 0 && (
                    <button
                      onClick={() => resetStrikes(loop.loop_name)}
                      className="text-xs text-fg-3 hover:text-fg underline"
                    >
                      Zerar strikes
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded actions table */}
              {expanded[loop.loop_name] && (
                <div className="mt-4 border-t pt-3">
                  {actionsLoading[loop.loop_name] && (
                    <p className="text-sm text-fg-3">Carregando ações...</p>
                  )}
                  {!actionsLoading[loop.loop_name] && (
                    <>
                      {(!actions[loop.loop_name] || actions[loop.loop_name].length === 0) ? (
                        <p className="text-sm text-fg-4">Nenhuma ação nos últimos 7 dias.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-surface-2 text-fg-2 text-left">
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
                                <tr key={a.id} className="border-t border-border hover:bg-surface-2">
                                  <td className="px-2 py-1 font-mono">{a.action_type}</td>
                                  <td className="px-2 py-1 text-fg-2">{a.target_table}</td>
                                  <td className="px-2 py-1 text-fg-3">{a.target_id ?? '—'}</td>
                                  <td className="px-2 py-1 text-fg-2 max-w-xs truncate" title={a.reasoning}>
                                    {a.reasoning ?? '—'}
                                  </td>
                                  <td className="px-2 py-1 text-fg-2">{a.evaluation ?? '—'}</td>
                                  <td className="px-2 py-1 text-fg-4 whitespace-nowrap">
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
