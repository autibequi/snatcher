import { useState, useEffect } from 'react'

// ---------- types ----------

interface LearnedWeight {
  group_id?: number
  group_name?: string
  category_id?: number
  category_name?: string
  source_id?: number
  source_name?: string
  ctr_30d?: number
  epc_30d?: number
  samples_30d: number
  confidence?: number
  updated_at: string
}

interface DailyMetric {
  date: string
  metric: string
  dimension: Record<string, unknown>
  value: number
}

interface ABTest {
  id: number
  param_id: number
  param_name: string
  proposed_value: number
  current_value: number
  weight_pct: number
  metric_name: string
  metric_baseline?: number
  metric_test?: number
  samples_baseline: number
  samples_test: number
  status: string
  started_at: string
  ends_at: string
  decided_at?: string
}

// ---------- helpers ----------

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtNum = (v: number, decimals = 4) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)

const fmtPct = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(v)

const fmtDate = (s: string) => s.slice(0, 10)

const statusBadge: Record<string, string> = {
  running:      'bg-blue-900/40 text-blue-300 border border-blue-700',
  promoted:     'bg-green-900/40 text-green-300 border border-green-700',
  rolled_back:  'bg-red-900/40 text-red-300 border border-red-700',
}

function Badge({ status }: { status: string }) {
  const cls = statusBadge[status] ?? 'bg-surface-2 text-fg-3 border border-border'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  )
}

// ---------- tab state ----------

type Tab = 'weights' | 'daily' | 'abtests'

// ---------- Aba 1 — Learned Weights ----------

function LearnedWeightsTab() {
  const [minSamples, setMinSamples] = useState(50)
  const [input, setInput] = useState('50')
  const [rows, setRows] = useState<LearnedWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (ms: number) => {
    setLoading(true)
    setError(null)
    fetch(`/api/admin/metrics/learned-weights?min_samples=${ms}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(minSamples) }, [minSamples])

  const apply = () => {
    const v = parseInt(input, 10)
    if (!isNaN(v) && v >= 0) setMinSamples(v)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-fg-2">Min. Samples</label>
        <input
          type="number"
          min={0}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          className="w-24 bg-surface-2 border border-border text-fg text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={apply}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          Aplicar
        </button>
        <span className="text-xs text-fg-3">{rows.length} registros</span>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          Erro: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-3">Sem registros para o filtro atual.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                <th className="px-4 py-2.5 font-medium">Grupo</th>
                <th className="px-4 py-2.5 font-medium">Categoria</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium text-right">Samples</th>
                <th className="px-4 py-2.5 font-medium text-right">CTR 30d</th>
                <th className="px-4 py-2.5 font-medium text-right">EPC 30d</th>
                <th className="px-4 py-2.5 font-medium text-right">Confianca</th>
                <th className="px-4 py-2.5 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-4 py-2 text-fg">
                    {row.group_name ?? (row.group_id != null ? `#${row.group_id}` : '—')}
                  </td>
                  <td className="px-4 py-2 text-fg-2">
                    {row.category_name ?? (row.category_id != null ? `#${row.category_id}` : '—')}
                  </td>
                  <td className="px-4 py-2 text-fg-2">
                    {row.source_name ?? (row.source_id != null ? `#${row.source_id}` : '—')}
                  </td>
                  <td className="px-4 py-2 text-right text-fg">
                    {row.samples_30d.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2 text-right text-fg-2">
                    {row.ctr_30d != null ? fmtPct(row.ctr_30d) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-accent font-mono">
                    {row.epc_30d != null ? brl(row.epc_30d) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-fg-2">
                    {row.confidence != null ? fmtNum(row.confidence, 2) : '—'}
                  </td>
                  <td className="px-4 py-2 text-fg-3 font-mono text-xs">
                    {fmtDate(row.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- Aba 2 — Daily Metrics ----------

const METRIC_OPTIONS = ['', 'sent', 'clicks', 'conversions', 'bans', 'epc']
const DAYS_OPTIONS = [7, 30, 90]

function DailyMetricsTab() {
  const [metric, setMetric] = useState('')
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (m: string, d: number) => {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ days: String(d) })
    if (m) qs.set('metric', m)
    fetch(`/api/admin/metrics/daily?${qs}`)
      .then(r => r.json())
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(metric, days) }, [metric, days])

  const total = rows.reduce((acc, r) => acc + r.value, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={metric}
          onChange={e => setMetric(e.target.value)}
          className="bg-surface-2 border border-border text-fg text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {METRIC_OPTIONS.map(o => (
            <option key={o} value={o}>{o || 'Todas as metricas'}</option>
          ))}
        </select>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-surface-2 border border-border text-fg text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {DAYS_OPTIONS.map(d => (
            <option key={d} value={d}>Ultimos {d} dias</option>
          ))}
        </select>
        <span className="text-xs text-fg-3">{rows.length} registros</span>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          Erro: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-3">Sem dados no periodo selecionado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Metrica</th>
                <th className="px-4 py-2.5 font-medium">Dimension</th>
                <th className="px-4 py-2.5 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-fg-2">{fmtDate(row.date)}</td>
                  <td className="px-4 py-2 text-fg">{row.metric}</td>
                  <td className="px-4 py-2 font-mono text-fg-3 text-xs max-w-[280px] truncate">
                    {JSON.stringify(row.dimension)}
                  </td>
                  <td className="px-4 py-2 text-right text-fg font-mono">
                    {fmtNum(row.value, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-2">
                <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-fg-2">Total</td>
                <td className="px-4 py-2 text-right font-semibold text-fg font-mono">
                  {fmtNum(total, 4)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- Aba 3 — A/B Tests ----------

const STATUS_OPTIONS = ['', 'running', 'promoted', 'rolled_back']

function ABTestsTab() {
  const [statusFilter, setStatusFilter] = useState('running')
  const [rows, setRows] = useState<ABTest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const load = (s: string) => {
    setLoading(true)
    setError(null)
    const qs = s ? `?status=${s}` : ''
    fetch(`/api/admin/metrics/ab-tests${qs}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(statusFilter) }, [statusFilter])

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const diffPct = (baseline?: number, test?: number): string => {
    if (baseline == null || test == null || baseline === 0) return '—'
    const d = (test - baseline) / Math.abs(baseline)
    const sign = d >= 0 ? '+' : ''
    return `${sign}${fmtPct(d)}`
  }

  const diffColor = (baseline?: number, test?: number): string => {
    if (baseline == null || test == null) return 'text-fg-3'
    return test >= baseline ? 'text-green-400' : 'text-red-400'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-surface-2 border border-border text-fg text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o} value={o}>{o || 'Todos os status'}</option>
          ))}
        </select>
        <span className="text-xs text-fg-3">{rows.length} testes</span>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          Erro: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-3">Nenhum teste encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                <th className="px-4 py-2.5 font-medium">Param</th>
                <th className="px-4 py-2.5 font-medium">Atual → Proposto</th>
                <th className="px-4 py-2.5 font-medium">Metrica</th>
                <th className="px-4 py-2.5 font-medium text-right">Baseline</th>
                <th className="px-4 py-2.5 font-medium text-right">Test</th>
                <th className="px-4 py-2.5 font-medium text-right">Samples B/T</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Inicio</th>
                <th className="px-4 py-2.5 font-medium">Fim / Decidido</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <>
                  <tr
                    key={row.id}
                    onClick={() => toggle(row.id)}
                    className="border-b border-border hover:bg-surface-2/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono text-fg">{row.param_name}</td>
                    <td className="px-4 py-2 text-fg-2 font-mono">
                      {fmtNum(row.current_value, 4)}
                      <span className="text-fg-3 mx-1">→</span>
                      {fmtNum(row.proposed_value, 4)}
                      <span className="text-fg-3 text-xs ml-1">({row.weight_pct}%)</span>
                    </td>
                    <td className="px-4 py-2 text-fg-2">{row.metric_name}</td>
                    <td className="px-4 py-2 text-right text-fg-2 font-mono">
                      {row.metric_baseline != null ? fmtNum(row.metric_baseline, 4) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-fg">
                      {row.metric_test != null ? fmtNum(row.metric_test, 4) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-fg-2 font-mono">
                      {row.samples_baseline.toLocaleString('pt-BR')}
                      <span className="text-fg-3 mx-1">/</span>
                      {row.samples_test.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2">
                      <Badge status={row.status} />
                    </td>
                    <td className="px-4 py-2 text-fg-3 font-mono text-xs">
                      {fmtDate(row.started_at)}
                    </td>
                    <td className="px-4 py-2 text-fg-3 font-mono text-xs">
                      {row.decided_at ? fmtDate(row.decided_at) : fmtDate(row.ends_at)}
                    </td>
                  </tr>

                  {expanded.has(row.id) && (
                    <tr key={`${row.id}-detail`} className="border-b border-border bg-surface/50">
                      <td colSpan={9} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-fg-3 uppercase tracking-wider mb-1">Diff %</p>
                            <p className={`font-semibold text-base ${diffColor(row.metric_baseline, row.metric_test)}`}>
                              {diffPct(row.metric_baseline, row.metric_test)}
                            </p>
                          </div>
                          <div>
                            <p className="text-fg-3 uppercase tracking-wider mb-1">Traffic split</p>
                            <p className="text-fg font-mono">{100 - row.weight_pct}% ctrl / {row.weight_pct}% test</p>
                          </div>
                          <div>
                            <p className="text-fg-3 uppercase tracking-wider mb-1">ID do teste</p>
                            <p className="text-fg font-mono">#{row.id}</p>
                          </div>
                          <div>
                            <p className="text-fg-3 uppercase tracking-wider mb-1">Encerra em</p>
                            <p className="text-fg font-mono">{fmtDate(row.ends_at)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- main ----------

const TABS: { id: Tab; label: string }[] = [
  { id: 'weights', label: 'Learned Weights' },
  { id: 'daily',   label: 'Daily Metrics' },
  { id: 'abtests', label: 'A/B Tests' },
]

export default function AdminMetrics() {
  const [tab, setTab] = useState<Tab>('weights')

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-fg">Analytics — Metrics Dashboard</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Pesos aprendidos, metricas diarias e testes A/B
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-3 hover:text-fg',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'weights' && <LearnedWeightsTab />}
      {tab === 'daily'   && <DailyMetricsTab />}
      {tab === 'abtests' && <ABTestsTab />}
    </div>
  )
}
