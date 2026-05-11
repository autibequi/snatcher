import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { pageContainer, sectionCard, filterBar, responsiveGrid } from '../lib/uiTokens'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Cluster {
  id: number
  label: string
  description?: string
  member_channels: number[] | string | null
  members_count?: number
  metrics: {
    ctr?: number
    cvr?: number
    avg_ticket?: number
    click_freq_per_day?: number
    peak_hour?: string
    price_min?: number
    price_max?: number
  }
  top_categories: string[] | string | null
  top_brands: string[] | string | null
  opportunity?: string
  computed_at: string
}

// ── Normalizers ────────────────────────────────────────────────────────────────
function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(x => typeof x === 'string')
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return v.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

function toNumberArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.filter(x => typeof x === 'number').map(x => x)
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p.filter(x => typeof x === 'number') : []
    } catch {
      return v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    }
  }
  return []
}

type Period = '7d' | '30d' | '90d'
type SortKey = 'ctr' | 'cvr' | 'avgTicket'

const PERIOD_LABELS: Record<Period, string> = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' }
const SORT_LABELS: Record<SortKey, string> = { ctr: 'CTR', cvr: 'CVR', avgTicket: 'Ticket' }

// ── Colors ─────────────────────────────────────────────────────────────────────

const COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#14b8a6', '#f97316']
const clusterColor = (idx: number) => COLORS[idx % COLORS.length]

// ── Bubble tooltip ─────────────────────────────────────────────────────────────

interface BubblePoint { x: number; y: number; z: number; label: string; id: number; colorIdx: number }

function BubbleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BubblePoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface border border-border rounded-md shadow-lg p-3 text-xs">
      <p className="font-semibold text-fg mb-1">{d.label}</p>
      <p className="text-fg-3">Membros: <span className="text-fg font-medium">{d.z}</span></p>
      <p className="text-fg-3">Freq/dia: <span className="text-fg font-medium">{d.x.toFixed(1)}</span></p>
      <p className="text-fg-3">Ticket: <span className="text-fg font-medium">{d.y > 0 ? `R$ ${Math.round(d.y)}` : '--'}</span></p>
    </div>
  )
}

// ── Cluster Card ───────────────────────────────────────────────────────────────

function ClusterCard({ cluster, colorIdx }: { cluster: Cluster; colorIdx: number }) {
  const m = cluster.metrics
  const members = cluster.members_count ?? cluster.member_channels?.length ?? 0
  const color = clusterColor(colorIdx)

  const fmtPct = (v?: number) => v != null ? `${(v * 100).toFixed(1)}%` : '--'
  const fmtTicket = (v?: number) => v != null ? `R$ ${Math.round(v)}` : '--'

  return (
    <div className={`${sectionCard} flex flex-col gap-3`} style={{ borderTop: `3px solid ${color}` }}>
      {/* Title row */}
      <div>
        <p className="text-sm font-semibold text-fg">{cluster.label}</p>
        {cluster.description && <p className="text-xs text-fg-3 mt-0.5">{cluster.description}</p>}
        <p className="text-xs text-fg-3 mt-0.5">{members.toLocaleString('pt-BR')} membros</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'CTR', value: fmtPct(m.ctr) },
          { label: 'CVR', value: fmtPct(m.cvr) },
          { label: 'Ticket', value: fmtTicket(m.avg_ticket) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-2 rounded-md p-2 text-center">
            <p className="text-xs text-fg-3">{label}</p>
            <p className="text-xs font-semibold text-fg">{value}</p>
          </div>
        ))}
      </div>

      {/* Top categories */}
      {toArray(cluster.top_categories).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {toArray(cluster.top_categories).slice(0, 4).map(cat => (
            <Badge key={cat} size="sm" variant="accent">{cat}</Badge>
          ))}
          {toArray(cluster.top_brands).slice(0, 2).map(brand => (
            <Badge key={brand} size="sm" variant="outline">{brand}</Badge>
          ))}
        </div>
      )}

      {/* Channel chips */}
      {(() => {
        const channels = toNumberArray(cluster.member_channels)
        return channels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {channels.slice(0, 6).map(cid => (
              <Link
                key={cid}
                to={`/channels/${cid}`}
                className="text-xs px-1.5 py-0.5 rounded border border-border text-fg-3 hover:text-accent hover:border-accent transition-colors"
              >
                #{cid}
              </Link>
            ))}
            {channels.length > 6 && (
              <span className="text-xs text-fg-3">+{channels.length - 6}</span>
            )}
          </div>
        ) : null
      })()}

      {/* Opportunity */}
      {cluster.opportunity && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-2.5">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Oportunidade</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{cluster.opportunity}</p>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Clusters() {
  const qc = useQueryClient()
  const [period, setPeriod] = React.useState<Period>('30d')
  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('ctr')

  const { data: clusters = [], isLoading } = useQuery<Cluster[]>({
    queryKey: ['clusters', period],
    queryFn: () =>
      apiClient
        .get(`/api/clusters?period=${period}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
  })

  const recompute = useMutation({
    mutationFn: () => apiClient.post('/api/clusters/recompute').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clusters'] }),
  })

  useWSEvent('product.new', () => {})

  const exportCSV = () => {
    if (!clusters.length) return
    const rows = [
      ['Label', 'Descricao', 'Membros', 'CTR (%)', 'CVR (%)', 'Ticket Medio', 'Top Categorias'],
      ...clusters.map(c => [
        c.label,
        c.description ?? '',
        String(c.members_count ?? c.member_channels?.length ?? 0),
        c.metrics.ctr ? (c.metrics.ctr * 100).toFixed(1) : '0',
        c.metrics.cvr ? (c.metrics.cvr * 100).toFixed(1) : '0',
        c.metrics.avg_ticket ? String(Math.round(c.metrics.avg_ticket)) : '0',
        toArray(c.top_categories).join('; '),
      ]),
    ]
    const csv = '﻿' + rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clusters.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalMembers = clusters.reduce(
    (acc, c) => acc + (c.members_count ?? c.member_channels?.length ?? 0),
    0,
  )

  const displayed = React.useMemo(() => {
    let list = [...clusters]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        toArray(c.top_categories).some(x => x.toLowerCase().includes(q))
      )
    }
    list.sort((a, b) => {
      if (sort === 'ctr') return (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0)
      if (sort === 'cvr') return (b.metrics.cvr ?? 0) - (a.metrics.cvr ?? 0)
      return (b.metrics.avg_ticket ?? 0) - (a.metrics.avg_ticket ?? 0)
    })
    return list
  }, [clusters, search, sort])

  const bubbleData: BubblePoint[] = clusters.map((c, idx) => ({
    id: c.id,
    label: c.label,
    colorIdx: idx,
    x: c.metrics.click_freq_per_day ?? idx * 2 + 1,
    y: c.metrics.avg_ticket ?? 0,
    z: c.members_count ?? c.member_channels?.length ?? 1,
  }))

  const subtitle = clusters.length > 0
    ? `${clusters.length} agrupamentos · ${totalMembers.toLocaleString('pt-BR')} membros`
    : 'Agrupamentos de comportamento similar'

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Clusters"
        subtitle={subtitle}
        className="mb-4"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={exportCSV} disabled={!clusters.length}>
              Exportar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              Recomputar
            </Button>
          </>
        }
      />

      {/* Filter bar */}
      <div className={`${filterBar} mb-4 -mx-3 sm:-mx-4`}>
        {/* Search */}
        <input
          type="search"
          placeholder="Buscar cluster..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:ring-2 focus:ring-accent/40 w-48"
        />

        {/* Period */}
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 transition-colors ${
                period === p ? 'bg-accent text-white font-medium' : 'bg-surface text-fg-2 hover:bg-surface-2'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 text-xs text-fg-3">
          <span>Ordenar:</span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`px-2 py-1 rounded-md transition-colors ${
                sort === k ? 'bg-accent text-white' : 'hover:bg-surface-2 text-fg-2'
              }`}
            >
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-md" />
          <div className={responsiveGrid}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-md" />)}
          </div>
        </div>
      ) : !clusters.length ? (
        <EmptyState
          title="Nenhum cluster calculado"
          description="Clique em Recomputar para agrupar canais por comportamento de audiência."
          cta={{ label: 'Recomputar agora', onClick: () => recompute.mutate() }}
        />
      ) : (
        <div className="space-y-6">
          {/* Bubble chart */}
          <div className={sectionCard}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-fg">Mapa de comportamento</p>
                <p className="text-xs text-fg-3">grupos plotados por padrao de clique</p>
              </div>
              <p className="text-xs text-fg-3 hidden sm:block">bolha = grupo · tamanho = membros · cor = cluster</p>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ top: 12, right: 12, bottom: 20, left: 12 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Freq. cliques/dia"
                  tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'frequencia de cliques / dia', position: 'insideBottom', offset: -10, style: { fontSize: 10, fill: 'var(--color-fg-3)' } }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Ticket medio"
                  tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => v > 0 ? `R$${v}` : ''}
                  label={{ value: 'ticket medio (R$)', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: 'var(--color-fg-3)' } }}
                />
                <ZAxis type="number" dataKey="z" range={[300, 3000]} />
                <Tooltip content={<BubbleTooltip />} cursor={false} />
                <Scatter data={bubbleData}>
                  {bubbleData.map(entry => (
                    <Cell
                      key={entry.id}
                      fill={clusterColor(entry.colorIdx)}
                      fillOpacity={0.75}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Cluster grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayed.map((c, idx) => (
              <ClusterCard
                key={c.id}
                cluster={c}
                colorIdx={clusters.findIndex(x => x.id === c.id)}
              />
            ))}
            {displayed.length === 0 && (
              <p className="col-span-full text-sm text-fg-3 py-8 text-center">Nenhum cluster encontrado para "{search}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
