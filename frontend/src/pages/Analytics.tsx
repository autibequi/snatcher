import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { apiClient } from '../lib/apiClient'
import { Skeleton } from '../components/ui'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  total: number
  unique: number
  days: number
  messages_sent: number
  catalog_total: number
  catalog_new: number
  daily: Array<{ date: string; clicks: number }>
  by_source: Array<{ source: string; clicks: number }>
  top_products: Array<{ id: number; title: string; source: string; price: number; clicks: number }>
  /** Cliques com channel_id preenchido */
  by_channel?: Array<{ id: number; name: string; clicks: number }>
  /** Atribuição 1/N quando um dispatch tem N grupos-alvo */
  by_group?: Array<{ id: number; name: string; clicks: number }>
  /** Taxonomia primary_category dos produtos clicados */
  by_category?: Array<{ id: number; name: string; slug: string; clicks: number }>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '7 dias',   value: 7 },
  { label: '30 dias',  value: 30 },
  { label: '90 dias',  value: 90 },
  { label: '1 ano',    value: 365 },
]

const SOURCE_COLORS: Record<string, string> = {
  amz:         '#f97316',
  amazon:      '#f97316',
  ml:          '#eab308',
  mercadolivre:'#eab308',
  magalu:      '#3b82f6',
  shopee:      '#ea580c',
  aliexpress:  '#ef4444',
  casasbahia:  '#f43f5e',
  kabum:       '#f59e0b',
  americanas:  '#dc2626',
}

const FALLBACK_COLORS = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#22c55e']
function sourceColor(src: string, idx: number): string {
  return SOURCE_COLORS[src?.toLowerCase()] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** Cliques podem ser fracionários (grupos com peso por dispatch). */
function fmtClickCount(n: number): string {
  if (Number.isInteger(n)) return fmt(n)
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function ClickRankList({
  title,
  subtitle,
  rows,
  fmtValue = fmtClickCount,
}: {
  title: string
  subtitle?: string
  rows: Array<{ name: string; clicks: number }>
  fmtValue?: (n: number) => string
}) {
  if (!rows?.length) {
    return (
      <div className="bg-surface border border-border rounded-md p-4">
        <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-1">{title}</p>
        {subtitle && <p className="text-[11px] text-fg-3 mb-3">{subtitle}</p>}
        <p className="text-sm text-fg-3 text-center py-10">Sem dados</p>
      </div>
    )
  }
  const max = rows[0]?.clicks || 1
  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-1">{title}</p>
      {subtitle && <p className="text-[11px] text-fg-3 mb-3">{subtitle}</p>}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const pct = Math.round((row.clicks / max) * 100)
          return (
            <div key={`${row.name}-${i}`} className="flex items-center gap-3">
              <span className="text-xs text-fg-3 w-4 shrink-0 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-fg truncate" title={row.name}>{row.name}</p>
                <div className="h-1 bg-surface-2 rounded-full mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-semibold text-fg">{fmtValue(row.clicks)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-fg">{typeof value === 'number' ? fmt(value) : value}</p>
      {sub && <p className="text-xs text-fg-3 mt-1">{sub}</p>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-2 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-fg font-semibold">{fmt(p.value)} cliques</p>
      ))}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function Analytics() {
  const [days, setDays] = React.useState(30)

  const { data, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ['analytics-summary', days],
    queryFn: () =>
      apiClient.get(`/api/analytics/summary?days=${days}`).then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const ctr = data && data.messages_sent > 0
    ? ((data.total / data.messages_sent) * 100).toFixed(1) + '%'
    : '—'

  return (
    <div className="p-6 space-y-6">
      {/* Header + filtro de período */}
      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex gap-1 bg-surface-2 rounded-md p-0.5 border border-border">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                days === opt.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-fg-2 hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Cliques totais" value={data?.total ?? 0} sub={`últimos ${days} dias`} />
          <KpiCard label="Cliques únicos" value={data?.unique ?? 0} sub="por IP" />
          <KpiCard label="CTR estimado" value={ctr} sub={`${fmt(data?.messages_sent ?? 0)} disparos`} />
          <KpiCard label="Produtos no catálogo" value={data?.catalog_total ?? 0} sub={`+${data?.catalog_new ?? 0} novos`} />
        </div>
      )}

      {/* Gráfico diário */}
      <div className="bg-surface border border-border rounded-md p-4">
        <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-4">
          Cliques por dia — últimos {days} dias
        </p>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data?.daily?.length ? (
          <p className="text-sm text-fg-3 text-center py-10">Sem dados no período</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.daily} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border,#e5e7eb)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-fg-3,#9ca3af)' }}
                tickFormatter={v => v.slice(5)}
                axisLine={false} tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-fg-3,#9ca3af)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="clicks" name="Cliques" fill="var(--color-accent,#6366f1)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pizza por fonte */}
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-4">Cliques por fonte</p>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data?.by_source?.length ? (
            <p className="text-sm text-fg-3 text-center py-10">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.by_source}
                  dataKey="clicks"
                  nameKey="source"
                  cx="50%" cy="50%"
                  outerRadius={70}
                  label={({ name, percent }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {data.by_source.map((entry, i) => (
                    <Cell key={i} fill={sourceColor(entry.source, i)} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-fg-2">{value}</span>
                  )}
                />
                <Tooltip
                  formatter={(val) => [fmt(Number(val ?? 0)), 'cliques']}
                  contentStyle={{
                    background: 'var(--color-surface,#fff)',
                    border: '1px solid var(--color-border,#e5e7eb)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top produtos */}
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Top produtos por cliques</p>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !data?.top_products?.length ? (
            <p className="text-sm text-fg-3 text-center py-10">Sem dados</p>
          ) : (
            <div className="space-y-2">
              {data.top_products.map((p, i) => {
                const max = data.top_products[0]?.clicks || 1
                const pct = Math.round((p.clicks / max) * 100)
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-xs text-fg-3 w-4 shrink-0 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-fg truncate" title={p.title}>{p.title}</p>
                      <div className="h-1 bg-surface-2 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-fg">{fmt(p.clicks)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Canal / grupo / categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ClickRankList
          title="Cliques por canal"
          subtitle="Só eventos com canal associado ao shortlink."
          rows={data?.by_channel ?? []}
          fmtValue={fmt}
        />
        <ClickRankList
          title="Cliques por grupo"
          subtitle="Peso 1/N quando o mesmo dispatch vai para N grupos."
          rows={data?.by_group ?? []}
        />
        <ClickRankList
          title="Cliques por categoria"
          subtitle="Categoria primária do produto no catálogo."
          rows={data?.by_category ?? []}
          fmtValue={fmt}
        />
      </div>
    </div>
  )
}
