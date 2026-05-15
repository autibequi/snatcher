import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { authFetch } from '../lib/authFetch'
import { ClustersTab } from './Clusters'
import { DataTable } from '../components/ui'
import type { ColumnDef } from '@tanstack/react-table'

const SOURCE_LABEL: Record<string, string> = {
  amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee',
  magazine_luiza: 'Magazine Luiza', magalu: 'Magazine Luiza',
  americanas: 'Americanas', aliexpress: 'AliExpress', awin: 'Awin', kinguin: 'Kinguin',
}
function sourceLabel(id: string | number) { return SOURCE_LABEL[String(id)] ?? String(id) }

const PARAM_LABEL: Record<string, string> = {
  quality_threshold: 'Score mínimo de qualidade', baseline_min: 'Mínimo diário por grupo',
  cap_max: 'Máximo diário por grupo', cooldown_seconds: 'Cooldown entre envios (s)',
  half_life_freshness: 'Meia-vida de frescor', half_life_learned: 'Meia-vida do peso aprendido',
  anti_saturation_decay: 'Penalidade de saturação', diversity_bonus_weight: 'Peso de diversidade',
  epsilon_base: 'Taxa de exploração', epsilon_decay_rate: 'Decay da exploração',
}
function paramLabel(name: string) { return PARAM_LABEL[name] ?? name }

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
  promoted:     'bg-success/20 text-success border border-success/30',
  rolled_back:  'bg-danger/20 text-danger border border-danger/30',
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

type Tab = 'weights' | 'daily' | 'abtests' | 'virality' | 'clusters'

const VALID_TABS = new Set<Tab>(['weights', 'daily', 'abtests', 'virality', 'clusters'])

interface ViralityRow {
  group_id: number
  group_name?: string
  channel_name?: string
  clicks_total: number
  unique_links: number
  member_count: number
  expected_max: number
  clicks_excedentes: number
  virality_ratio: number
}

function ViralityTab() {
  const [rows, setRows] = useState<ViralityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const r = await authFetch('/api/admin/metrics/virality')
        setRows((await r.json()) || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const ratioColor = (r: number) =>
    r >= 0.5 ? 'text-success' : r >= 0.2 ? 'text-warning' : 'text-fg-3'

  return (
    <section>
      <p className="text-sm text-fg-3 mb-3">
        Cliques externos por grupo (acima de <b>k × members</b>). Métrica
        observacional — não influencia o scoring (clicks excedentes já são
        descartados pelo cap). Alto ratio = grupo cujos links viralizam fora,
        boa cobertura externa.
      </p>
      {loading && <p className="text-fg-3">Carregando…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-fg-3">Sem dados de viralização ainda.</p>
      )}
      {!loading && rows.length > 0 && (
        <div className="border rounded-lg bg-surface shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-fg-2">Grupo</th>
                <th className="text-left px-3 py-2 font-medium text-fg-2">Canal</th>
                <th className="text-right px-3 py-2 font-medium text-fg-2">Members</th>
                <th className="text-right px-3 py-2 font-medium text-fg-2">Links únicos</th>
                <th className="text-right px-3 py-2 font-medium text-fg-2">Clicks totais</th>
                <th className="text-right px-3 py-2 font-medium text-fg-2">Esperado</th>
                <th className="text-right px-3 py-2 font-medium text-fg-2">Excedente</th>
                <th className="text-right px-3 py-2 font-medium text-fg-2">Virality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr key={row.group_id} className="hover:bg-surface-2">
                  <td className="px-3 py-2 text-fg">{row.group_name ?? `#${row.group_id}`}</td>
                  <td className="px-3 py-2 text-fg-3">{row.channel_name ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-fg-3">{row.member_count}</td>
                  <td className="px-3 py-2 text-right text-fg-3">{row.unique_links}</td>
                  <td className="px-3 py-2 text-right text-fg">{row.clicks_total}</td>
                  <td className="px-3 py-2 text-right text-fg-3">{row.expected_max}</td>
                  <td className="px-3 py-2 text-right text-fg-3">{row.clicks_excedentes}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${ratioColor(row.virality_ratio)}`}>
                    {(row.virality_ratio * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ---------- Aba 1 — Learned Weights ----------

const LEARNED_WEIGHTS_COLUMNS: ColumnDef<LearnedWeight, unknown>[] = [
  { accessorKey: 'group_name', header: 'Grupo', cell: ({ row }) => row.original.group_name ?? (row.original.group_id != null ? `#${row.original.group_id}` : '—') },
  { accessorKey: 'category_name', header: 'Categoria', cell: ({ row }) => <span className="text-fg-2">{row.original.category_name ?? (row.original.category_id != null ? `#${row.original.category_id}` : '—')}</span> },
  { accessorKey: 'source_name', header: 'Source', cell: ({ row }) => <span className="text-fg-2">{row.original.source_name ?? (row.original.source_id != null ? sourceLabel(row.original.source_id) : '—')}</span> },
  { accessorKey: 'samples_30d', header: 'Samples', cell: ({ getValue }) => <span className="text-right block">{getValue<number>().toLocaleString('pt-BR')}</span> },
  { accessorKey: 'ctr_30d', header: 'CTR 30d', cell: ({ getValue }) => <span className="text-right block text-fg-2">{getValue<number | undefined>() != null ? fmtPct(getValue<number>()) : '—'}</span> },
  { accessorKey: 'epc_30d', header: 'EPC 30d', cell: ({ getValue }) => <span className="text-right block text-accent font-mono">{getValue<number | undefined>() != null ? brl(getValue<number>()) : '—'}</span> },
  { accessorKey: 'confidence', header: 'Confiança', cell: ({ getValue }) => <span className="text-right block text-fg-2">{getValue<number | undefined>() != null ? fmtNum(getValue<number>(), 2) : '—'}</span> },
  { accessorKey: 'updated_at', header: 'Atualizado', cell: ({ getValue }) => <span className="font-mono text-xs text-fg-3">{fmtDate(getValue<string>())}</span> },
]

function LearnedWeightsTab() {
  const [minSamples, setMinSamples] = useState(50)
  const [input, setInput] = useState('50')
  const [rows, setRows] = useState<LearnedWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (ms: number) => {
    setLoading(true)
    setError(null)
    authFetch(`/api/admin/metrics/learned-weights?min_samples=${ms}`)
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
        <div className="bg-danger/20 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">
          Erro: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? null : (
        <DataTable
          data={rows}
          columns={LEARNED_WEIGHTS_COLUMNS}
          pageSize={20}
          emptyMessage="Sem registros para o filtro atual."
        />
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
    authFetch(`/api/admin/metrics/daily?${qs}`)
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
        <div className="bg-danger/20 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">
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
    authFetch(`/api/admin/metrics/ab-tests${qs}`)
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
    return test >= baseline ? 'text-success' : 'text-danger'
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
        <div className="bg-danger/20 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">
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
                    <td className="px-4 py-2 text-fg" title={row.param_name}>{paramLabel(row.param_name)}</td>
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
  { id: 'weights',  label: 'Learned Weights' },
  { id: 'daily',    label: 'Daily Metrics' },
  { id: 'abtests',  label: 'A/B Tests' },
  { id: 'virality', label: 'Virality' },
  { id: 'clusters', label: 'Clusters' },
]

export default function AdminMetrics() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam && VALID_TABS.has(tabParam as Tab) ? (tabParam as Tab) : 'weights'

  const setTab = (t: Tab) => {
    setSearchParams(
      prev => {
        const p = new URLSearchParams(prev)
        if (t === 'weights') p.delete('tab')
        else p.set('tab', t)
        return p
      },
      { replace: true },
    )
  }

  return (
    <div className="p-4 md:mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-fg">Métricas</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Pesos aprendidos, métricas diárias, A/B, viralização e clusters de canais
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors shrink-0',
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
      {tab === 'weights'  && <LearnedWeightsTab />}
      {tab === 'daily'    && <DailyMetricsTab />}
      {tab === 'abtests'  && <ABTestsTab />}
      {tab === 'virality' && <ViralityTab />}
      {tab === 'clusters' && <ClustersTab />}
    </div>
  )
}
