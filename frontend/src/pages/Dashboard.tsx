import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { KpiCard, Badge, Skeleton, EmptyState } from '../components/ui'
import { OperationInbox } from '../components/dashboard/OperationInbox'
import { ChannelPerformanceTable } from '../components/dashboard/ChannelPerformanceTable'
import { UpcomingDispatches } from '../components/dashboard/UpcomingDispatches'
import { apiClient } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { useWSEvent } from '../lib/useWS'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface KPIs {
  // Campos originais (mantidos por compatibilidade)
  dispatches_24h?: number
  clicks_24h?: number
  revenue_24h?: number
  conversion_pct?: number
  // Campos novos — deltas e métricas da wave 2
  dispatches_delta_pct?: number
  ctr_avg_pp_delta?: number
  unique_clicks?: number
  health_score?: number
  accounts_normal_count?: number
}

interface Product {
  id: number
  canonical_name?: string
  title?: string
  marketplace?: string
  lowest_price?: number
  price?: number
  lowest_price_source?: string
  image_url?: string
}

// ── Mock fallback para KPIs (enquanto backend não expõe os novos campos) ───────
// TODO: backend deve expor dispatches_delta_pct, ctr_avg_pp_delta, unique_clicks,
//       health_score, accounts_normal_count em GET /api/dashboard/kpis

const KPI_MOCK_FALLBACK = {
  dispatches_delta_pct: 12,
  ctr_avg_pp_delta: 0.6,
  unique_clicks: 2184,
  health_score: 87,
  accounts_normal_count: 2,
}

// ── Health score color helper ──────────────────────────────────────────────────

function healthScoreClass(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [feed, setFeed] = React.useState<Product[]>([])

  const hora = new Date().getHours()
  const greeting = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const { data: kpis } = useQuery<KPIs>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/kpis?period=7d')
        .then(r => r.data as KPIs)
        .catch(() => ({} as KPIs)),
    refetchInterval: 60_000,
  })

  const { data: catalogData, isLoading: loadingFeed } = useQuery({
    queryKey: ['catalog', { limit: 20, dashboard: true }],
    queryFn: () =>
      apiClient
        .get('/api/catalog?limit=20')
        .then(r => r.data)
        .catch(() => []),
  })

  useWSEvent('product.new', (data) => {
    setFeed(prev => [data.product as unknown as Product, ...prev].slice(0, 50))
  })

  const products: Product[] = feed.length > 0
    ? feed
    : (Array.isArray(catalogData) ? catalogData : (catalogData?.items ?? []))

  // Merge backend KPIs com fallback mock para campos ausentes
  const resolvedKpis = { ...KPI_MOCK_FALLBACK, ...kpis }

  // Disparos 7D
  const dispatches7d = resolvedKpis.dispatches_24h ?? '—'
  const dispatchesDelta = resolvedKpis.dispatches_delta_pct

  // CTR médio
  const ctrAvg = resolvedKpis.conversion_pct
  const ctrDelta = resolvedKpis.ctr_avg_pp_delta

  // Cliques 7D
  const clicks7d = resolvedKpis.clicks_24h ?? '—'
  const uniqueClicks = resolvedKpis.unique_clicks

  // Saúde anti-ban
  const healthScore = resolvedKpis.health_score
  const accountsNormal = resolvedKpis.accounts_normal_count

  const healthValue =
    healthScore !== undefined
      ? (
          <span>
            <span className={healthScoreClass(healthScore)}>{healthScore}</span>
            <span className="text-base text-fg-3 font-normal">/100</span>
          </span>
        )
      : '—'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── 1. Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            {greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          {/* Subtítulo dinâmico — gerenciado pelo card 022-03 (não alterar aqui) */}
          <p className="text-sm text-fg-3 mt-0.5" id="dashboard-subtitle">
            {/* placeholder — card 022-03 substitui este nó */}
            Carregando...
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['dashboard'] })
              qc.invalidateQueries({ queryKey: ['catalog'] })
            }}
            className="text-sm text-fg-2 border border-border rounded-md px-3 py-1.5 hover:bg-surface-2"
          >
            ↻ Atualizar
          </button>
          <button
            type="button"
            onClick={() => navigate('/compose')}
            className="text-sm bg-accent text-white rounded-md px-3 py-1.5 hover:bg-accent-hover flex items-center gap-1.5"
          >
            ✈ Novo disparo
          </button>
        </div>
      </div>

      {/* ── 2. OperationInbox ───────────────────────────────────────────────── */}
      <OperationInbox />

      {/* ── 3. KPIs — 4 cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* DISPAROS · 7D */}
        <button type="button" className="text-left w-full" onClick={() => navigate('/logs')}>
          <KpiCard
            label="Disparos · 7D"
            value={dispatches7d}
            delta={
              dispatchesDelta !== undefined
                ? {
                    displayText: `↑${dispatchesDelta}% vs semana anterior`,
                    tone: dispatchesDelta >= 0 ? 'success' : 'danger',
                  }
                : undefined
            }
          />
        </button>

        {/* CTR MÉDIO */}
        <KpiCard
          label="CTR Médio"
          value={ctrAvg !== undefined ? `${Number(ctrAvg).toFixed(1)}%` : '—'}
          delta={
            ctrDelta !== undefined
              ? {
                  displayText: `↑${ctrDelta.toFixed(1)} pp`,
                  tone: ctrDelta >= 0 ? 'success' : 'danger',
                }
              : undefined
          }
        />

        {/* CLIQUES · 7D */}
        <button type="button" className="text-left w-full" onClick={() => navigate('/logs')}>
          <KpiCard
            label="Cliques · 7D"
            value={clicks7d}
            subtitle={uniqueClicks !== undefined ? `${uniqueClicks.toLocaleString('pt-BR')} únicos` : undefined}
          />
        </button>

        {/* SAÚDE ANTI-BAN */}
        <KpiCard
          label="Saúde Anti-ban"
          value={healthValue as unknown as string}
          subtitle={
            accountsNormal !== undefined
              ? `${accountsNormal} conta${accountsNormal !== 1 ? 's' : ''} em uso normal`
              : undefined
          }
        />
      </div>

      {/* ── 4. Grid 2 col: ChannelPerformanceTable | UpcomingDispatches ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChannelPerformanceTable />
        <UpcomingDispatches />
      </div>

      {/* ── 5. Produtos novos (mantido — card 022-08 remove) ─────────────────── */}
      <div>
        <p className="text-sm font-medium text-fg-2 mb-3">Produtos novos</p>
        {loadingFeed ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            title="Nenhum produto ainda"
            description="Configure um crawler para coletar produtos."
            cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }}
          />
        ) : (
          <div className="space-y-2">
            {products.slice(0, 15).map((p, i) => (
              <div
                key={p.id ?? i}
                className="flex items-center gap-3 p-3 bg-surface border border-border rounded-md hover:border-border-strong cursor-pointer transition-colors"
                onClick={() => navigate(`/match?productId=${p.id}`)}
              >
                <div className="w-12 h-12 bg-surface-2 rounded-sm flex-shrink-0 overflow-hidden">
                  {p.image_url
                    ? <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                    : <span className="flex items-center justify-center h-full text-xl">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">
                    {p.canonical_name ?? p.title ?? 'Produto'}
                  </p>
                  <div className="flex gap-1.5 mt-0.5 flex-wrap">
                    {p.lowest_price_source && <Badge size="sm">{p.lowest_price_source}</Badge>}
                    {((p.lowest_price ?? p.price ?? 0) > 0) && (
                      <span className="text-xs text-fg-2">
                        R$ {((p.lowest_price ?? p.price) as number).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-accent flex-shrink-0">Match →</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Insights IA (mantido — card 022-08 remove) ───────────────────────── */}
      <div className="bg-surface border border-border rounded-md p-4">
        <p className="text-sm font-medium text-fg mb-3">Insights IA</p>
        <p className="text-sm text-fg-3 italic">
          Configure o LLM em{' '}
          <a href="/settings" className="text-accent hover:underline">
            Configurações → LLM / IA
          </a>{' '}
          para ver insights automáticos.
        </p>
      </div>

    </div>
  )
}
