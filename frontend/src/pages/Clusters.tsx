import React from 'react'
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
  PieChart,
  Pie,
} from 'recharts'
import { Badge, Button, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviceSplit {
  ios?: number
  android?: number
  web?: number
}

interface Cluster {
  id: number
  label: string
  description?: string
  member_channels: number[]
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
  top_categories: string[]
  top_brands: string[]
  device_split?: DeviceSplit
  opportunity?: string
  computed_at: string
}

type Period = '7d' | '30d' | '90d'

// ── Cluster colours (up to 8) ─────────────────────────────────────────────────

const CLUSTER_COLORS = [
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#a855f7', // purple
  '#14b8a6', // teal
  '#f97316', // orange
]

function clusterColor(idx: number): string {
  return CLUSTER_COLORS[idx % CLUSTER_COLORS.length]
}

// ── Donut for device split ────────────────────────────────────────────────────

interface DeviceDonutProps {
  split: DeviceSplit
}

function DeviceDonut({ split }: DeviceDonutProps) {
  const DEVICE_COLORS: Record<string, string> = {
    iOS: '#6366f1',
    Android: '#10b981',
    Web: '#f59e0b',
  }

  const total = (split.ios ?? 0) + (split.android ?? 0) + (split.web ?? 0)
  if (total === 0) return <p className="text-xs text-fg-3">—</p>

  const data = [
    { name: 'iOS', value: split.ios ?? 0 },
    { name: 'Android', value: split.android ?? 0 },
    { name: 'Web', value: split.web ?? 0 },
  ].filter(d => d.value > 0)

  const dominant = data.reduce((a, b) => (a.value > b.value ? a : b))
  const dominantPct = Math.round((dominant.value / total) * 100)

  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 flex-shrink-0">
        <PieChart width={48} height={48}>
          <Pie
            data={data}
            cx={20}
            cy={20}
            innerRadius={14}
            outerRadius={22}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map(entry => (
              <Cell key={entry.name} fill={DEVICE_COLORS[entry.name] ?? '#888'} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <div>
        <p className="text-xs font-medium text-fg">
          {dominant.name} {dominantPct}%
        </p>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {data.map(d => (
            <p key={d.name} className="text-xs text-fg-3">
              {d.name}: {Math.round((d.value / total) * 100)}%
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  cluster: Cluster
  colorIdx: number
  onClose: () => void
}

function DetailPanel({ cluster, colorIdx, onClose }: DetailPanelProps) {
  const color = clusterColor(colorIdx)
  const m = cluster.metrics

  const hasPriceRange =
    m.price_min !== undefined || m.price_max !== undefined
  const priceLabel = hasPriceRange
    ? `R$ ${m.price_min ?? '?'}–${m.price_max ?? '?'}`
    : m.avg_ticket
      ? `≈ R$ ${Math.round(m.avg_ticket)}`
      : '—'

  const opportunityText =
    cluster.opportunity ??
    (m.avg_ticket && m.avg_ticket > 150
      ? `Alto ticket médio (R$ ${Math.round(m.avg_ticket)}). Considere ampliar categorias de alto valor.`
      : m.ctr && m.ctr > 0.08
        ? `CTR acima da média. Bom momento para testes A/B de produto.`
        : null)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-start justify-between p-4 border-b border-border"
        style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      >
        <div>
          <p className="font-semibold text-fg">{cluster.label}</p>
          {cluster.description && (
            <p className="text-xs text-fg-3 mt-0.5">{cluster.description}</p>
          )}
          <p className="text-xs text-fg-3 mt-1">
            {cluster.members_count ?? cluster.member_channels?.length ?? 0} membros
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-fg-3 hover:text-fg transition-colors p-1 -mr-1"
          aria-label="Fechar painel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>

      {/* Cards */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Device */}
        <div>
          <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-2">
            Dispositivo
          </p>
          {cluster.device_split ? (
            <DeviceDonut split={cluster.device_split} />
          ) : (
            <p className="text-xs text-fg-3">—</p>
          )}
        </div>

        {/* Pico de clique */}
        <div>
          <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-1">
            Pico de clique
          </p>
          <p className="text-sm font-medium text-fg">
            {m.peak_hour ?? '—'}
          </p>
        </div>

        {/* Top categorias */}
        {cluster.top_categories?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-2">
              Top categorias
            </p>
            <div className="flex flex-wrap gap-1">
              {cluster.top_categories.slice(0, 5).map(cat => (
                <Badge key={cat} size="sm" variant="accent">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Faixa de preço */}
        <div>
          <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-1">
            Faixa de preço média
          </p>
          <p className="text-sm font-medium text-fg">{priceLabel}</p>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-2 rounded-md p-2">
            <p className="text-xs text-fg-3">CTR</p>
            <p className="text-sm font-semibold text-fg">
              {m.ctr ? `${(m.ctr * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="bg-surface-2 rounded-md p-2">
            <p className="text-xs text-fg-3">CVR</p>
            <p className="text-sm font-semibold text-fg">
              {m.cvr ? `${(m.cvr * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Oportunidade */}
        {opportunityText && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
              Oportunidade
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {opportunityText}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bubble Tooltip ─────────────────────────────────────────────────────────────

interface BubbleTooltipProps {
  active?: boolean
  payload?: Array<{ payload: BubblePoint }>
}

function BubbleTooltip({ active, payload }: BubbleTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface border border-border rounded-md shadow-lg p-3 text-xs">
      <p className="font-semibold text-fg mb-1">{d.label}</p>
      <p className="text-fg-3">Membros: <span className="text-fg font-medium">{d.z}</span></p>
      <p className="text-fg-3">Freq. cliques/dia: <span className="text-fg font-medium">{d.x.toFixed(1)}</span></p>
      <p className="text-fg-3">Ticket médio: <span className="text-fg font-medium">
        {d.y > 0 ? `R$ ${Math.round(d.y)}` : '—'}
      </span></p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface BubblePoint {
  x: number
  y: number
  z: number
  label: string
  id: number
  colorIdx: number
}

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
}

export default function Clusters() {
  const qc = useQueryClient()
  const [period, setPeriod] = React.useState<Period>('30d')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)

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

  useWSEvent('product.new', () => {
    // silently refetch
  })

  const exportCSV = () => {
    if (!clusters.length) return
    const rows = [
      ['Label', 'Descrição', 'Membros', 'CTR (%)', 'CVR (%)', 'Ticket Médio', 'Top Categorias'],
      ...clusters.map(c => [
        c.label,
        c.description ?? '',
        String(c.members_count ?? c.member_channels?.length ?? 0),
        c.metrics.ctr ? (c.metrics.ctr * 100).toFixed(1) : '0',
        c.metrics.cvr ? (c.metrics.cvr * 100).toFixed(1) : '0',
        c.metrics.avg_ticket ? String(Math.round(c.metrics.avg_ticket)) : '0',
        (c.top_categories ?? []).join('; '),
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

  // Build scatter data — fallback to index-based x/y when fields absent
  const bubbleData: BubblePoint[] = clusters.map((c, idx) => ({
    id: c.id,
    label: c.label,
    colorIdx: idx,
    x: c.metrics.click_freq_per_day ?? idx * 2 + 1,
    y: c.metrics.avg_ticket ?? 0,
    z: c.members_count ?? c.member_channels?.length ?? 1,
  }))

  const selectedCluster = selectedId !== null
    ? clusters.find(c => c.id === selectedId) ?? null
    : null
  const selectedColorIdx = selectedCluster
    ? clusters.findIndex(c => c.id === selectedCluster.id)
    : 0

  const totalMembers = clusters.reduce(
    (acc, c) => acc + (c.members_count ?? c.member_channels?.length ?? 0),
    0,
  )

  const hasData = !isLoading && clusters.length > 0

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-fg">Clusters</h1>
          {hasData && (
            <p className="text-xs text-fg-3 mt-0.5">
              {clusters.length} agrupamentos · {totalMembers.toLocaleString('pt-BR')} membros
              {clusters[0]?.computed_at && (
                <> · última análise {new Date(clusters[0].computed_at).toLocaleString('pt-BR')}</>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period filter */}
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 transition-colors ${
                  period === p
                    ? 'bg-accent text-white font-medium'
                    : 'bg-surface text-fg-2 hover:bg-surface-2'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={exportCSV}
            disabled={!hasData}
          >
            Exportar relatório
          </Button>

          <Button
            variant="secondary"
            size="sm"
            loading={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            Recomputar clusters
          </Button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-md" />
            ))}
          </div>
        </div>
      ) : !clusters.length ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-fg font-medium mb-1">Nenhum cluster calculado</p>
            <p className="text-sm text-fg-3 mb-4">
              Clique em Recomputar para agrupar canais por comportamento de audiência.
            </p>
            <Button
              variant="secondary"
              size="sm"
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              Recomputar agora
            </Button>
          </div>
        </div>
      ) : (
        <div className={`flex gap-4 flex-1 min-h-0 ${selectedCluster ? 'flex-col lg:flex-row' : 'flex-col'}`}>
          {/* Left: chart + list */}
          <div className="flex flex-col gap-4 flex-1 min-w-0">
            {/* Bubble Chart */}
            <div className="bg-surface border border-border rounded-md p-4">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className="text-sm font-medium text-fg">Mapa de comportamento</p>
                  <p className="text-xs text-fg-3">grupos plotados por padrão de clique</p>
                </div>
                <p className="text-xs text-fg-3 hidden sm:block">
                  cada bolha = um grupo · tamanho = membros · cor = cluster
                </p>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 16 }}>
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Freq. cliques/dia"
                    tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: 'frequência de cliques / dia →',
                      position: 'insideBottom',
                      offset: -12,
                      style: { fontSize: 10, fill: 'var(--color-fg-3)' },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Ticket médio"
                    tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v > 0 ? `R$${v}` : ''}
                    label={{
                      value: '↑ ticket médio (R$)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      style: { fontSize: 10, fill: 'var(--color-fg-3)' },
                    }}
                  />
                  <ZAxis type="number" dataKey="z" range={[400, 4000]} />
                  <Tooltip content={<BubbleTooltip />} cursor={false} />
                  <Scatter
                    data={bubbleData}
                    onClick={(d) => {
                      const point = d as unknown as BubblePoint
                      setSelectedId(point.id === selectedId ? null : point.id)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {bubbleData.map(entry => (
                      <Cell
                        key={entry.id}
                        fill={clusterColor(entry.colorIdx)}
                        fillOpacity={
                          selectedId === null || selectedId === entry.id ? 0.8 : 0.25
                        }
                        stroke={selectedId === entry.id ? 'var(--color-fg)' : 'transparent'}
                        strokeWidth={2}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Cluster List */}
            <div className="bg-surface border border-border rounded-md overflow-hidden">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-sm font-medium text-fg">Clusters detectados</p>
              </div>
              <div className="divide-y divide-border">
                {clusters.map((c, idx) => {
                  const members = c.members_count ?? c.member_channels?.length ?? 0
                  const color = clusterColor(idx)
                  const isSelected = c.id === selectedId
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(isSelected ? null : c.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                        isSelected ? 'bg-surface-2' : ''
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{c.label}</p>
                        <p className="text-xs text-fg-3">
                          {members.toLocaleString('pt-BR')} membros
                          {c.metrics.ctr ? ` · CTR ${(c.metrics.ctr * 100).toFixed(1)}%` : ''}
                        </p>
                      </div>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="text-fg-3 flex-shrink-0"
                      >
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right: Detail Panel */}
          {selectedCluster && (
            <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-surface border border-border rounded-md overflow-hidden flex flex-col">
              <DetailPanel
                cluster={selectedCluster}
                colorIdx={selectedColorIdx}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
