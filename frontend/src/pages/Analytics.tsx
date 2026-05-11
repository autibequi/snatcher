import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { apiClient } from '../lib/apiClient'
import { pushAnalyticsSummary } from '../lib/gtm'
import { KpiCard, PageHeader, SegmentedControl, Skeleton } from '../components/ui'
import type { SegmentedOption } from '../components/ui'
import { pageContainer, responsiveKpiGrid, sectionCard } from '../lib/uiTokens'

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
  by_channel?: Array<{ id: number; name: string; clicks: number }>
  by_group?: Array<{ id: number; name: string; clicks: number }>
  by_category?: Array<{ id: number; name: string; slug: string; clicks: number }>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type PeriodValue = '7' | '30' | '90' | '365'

const PERIOD_OPTIONS: SegmentedOption<PeriodValue>[] = [
  { value: '7',   label: '7 dias' },
  { value: '30',  label: '30 dias' },
  { value: '90',  label: '90 dias' },
  { value: '365', label: '1 ano' },
]

const SOURCE_COLORS: Record<string, string> = {
  amz:          '#f97316',
  amazon:       '#f97316',
  ml:           '#eab308',
  mercadolivre: '#eab308',
  magalu:       '#3b82f6',
  shopee:       '#ea580c',
  aliexpress:   '#ef4444',
  casasbahia:   '#f43f5e',
  kabum:        '#f59e0b',
  americanas:   '#dc2626',
}

const FALLBACK_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#22c55e']

function sourceColor(src: string, idx: number): string {
  return SOURCE_COLORS[src?.toLowerCase()] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR')
}

function fmtClickCount(n: number): string {
  if (Number.isInteger(n)) return fmt(n)
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-2 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-fg font-semibold">{fmt(p.value)} cliques</p>
      ))}
    </div>
  )
}

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
  const max = rows[0]?.clicks || 1
  return (
    <div className={sectionCard}>
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-1">{title}</p>
      {subtitle && <p className="text-[11px] text-fg-3 mb-3">{subtitle}</p>}
      {!rows?.length ? (
        <p className="text-sm text-fg-3 text-center py-10">Sem dados</p>
      ) : (
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
                <span className="text-xs font-semibold text-fg shrink-0">{fmtValue(row.clicks)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Pagina principal ──────────────────────────────────────────────────────────

export default function Analytics() {
  const [period, setPeriod] = React.useState<PeriodValue>('30')
  const days = Number(period)

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

  React.useEffect(() => {
    if (isLoading || !data) return
    pushAnalyticsSummary({
      analytics_period_days: days,
      analytics_total_clicks: data.total,
      analytics_unique_clicks: data.unique,
      analytics_messages_sent: data.messages_sent ?? 0,
      analytics_catalog_total: data.catalog_total ?? 0,
      analytics_catalog_new: data.catalog_new ?? 0,
    })
  }, [isLoading, data, days])

  return (
    <div className={pageContainer + ' space-y-6'}>
      <PageHeader
        title="Analytics"
        subtitle={'Metricas de cliques e desempenho dos ultimos ' + days + ' dias'}
        actions={
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
          />
        }
      />

      {/* KPIs */}
      {isLoading ? (
        <div className={responsiveKpiGrid}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className={responsiveKpiGrid}>
          <KpiCard
            label="Cliques totais"
            value={fmt(data?.total ?? 0)}
            subtitle={'ultimos ' + days + ' dias'}
          />
          <KpiCard
            label="Cliques unicos"
            value={fmt(data?.unique ?? 0)}
            subtitle="por IP"
          />
          <KpiCard
            label="CTR estimado"
            value={ctr}
            subtitle={fmt(data?.messages_sent ?? 0) + ' disparos'}
          />
          <KpiCard
            label="Produtos no catalogo"
            value={fmt(data?.catalog_total ?? 0)}
            subtitle={'+' + (data?.catalog_new ?? 0) + ' novos'}
          />
        </div>
      )}

      {/* Grafico diario */}
      <div className={sectionCard}>
        <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-4">
          Cliques por dia — ultimos {days} dias
        </p>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data?.daily?.length ? (
          <p className="text-sm text-fg-3 text-center py-10">Sem dados no periodo</p>
        ) : (
          <div className="h-[160px] sm:h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border,#e5e7eb)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-fg-3,#9ca3af)' }}
                  tickFormatter={v => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-fg-3,#9ca3af)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="clicks" name="Cliques" fill="var(--color-accent,#6366f1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pizza por fonte + Top produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={sectionCard}>
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-4">Cliques por fonte</p>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data?.by_source?.length ? (
            <p className="text-sm text-fg-3 text-center py-10">Sem dados</p>
          ) : (
            <div className="h-[180px] sm:h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.by_source}
                    dataKey="clicks"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius="75%"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      (name ?? '') + ' ' + ((percent ?? 0) * 100).toFixed(0) + '%'
                    }
                    labelLine={false}
                  >
                    {data.by_source.map((entry, i) => (
                      <Cell key={i} fill={sourceColor(entry.source, i)} />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs text-fg-2">{value}</span>
                    )}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [fmt(Number(val ?? 0)), 'cliques']}
                    contentStyle={{
                      background: 'var(--color-surface,#fff)',
                      border: '1px solid var(--color-border,#e5e7eb)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={sectionCard}>
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Top produtos por cliques</p>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !data?.top_products?.length ? (
            <p className="text-sm text-fg-3 text-center py-10">Sem dados</p>
          ) : (
            <div className="space-y-2">
              {data.top_products.map((p, i) => {
                const maxClicks = data.top_products[0]?.clicks || 1
                const pct = Math.round((p.clicks / maxClicks) * 100)
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-xs text-fg-3 w-4 shrink-0 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-fg truncate" title={p.title}>{p.title}</p>
                      <div className="h-1 bg-surface-2 rounded-full mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-fg shrink-0">{fmt(p.clicks)}</span>
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
          subtitle="So eventos com canal associado ao shortlink."
          rows={(data?.by_channel ?? []).map(r => ({ name: r.name, clicks: r.clicks }))}
          fmtValue={fmt}
        />
        <ClickRankList
          title="Cliques por grupo"
          subtitle="Peso 1/N quando o mesmo dispatch vai para N grupos."
          rows={(data?.by_group ?? []).map(r => ({ name: r.name, clicks: r.clicks }))}
        />
        <ClickRankList
          title="Cliques por categoria"
          subtitle="Categoria primaria do produto no catalogo."
          rows={(data?.by_category ?? []).map(r => ({ name: r.name, clicks: r.clicks }))}
          fmtValue={fmt}
        />
      </div>
    </div>
  )
}
