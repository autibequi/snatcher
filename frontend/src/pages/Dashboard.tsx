import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { KpiCard, Badge, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { useWSEvent } from '../lib/useWS'

// ── Tipos ──────────────────────────────────────────────

interface KPIs {
  dispatches_24h?: number
  clicks_24h?: number
  revenue_24h?: number
  conversion_pct?: number
  dispatches_delta_pct?: number
  clicks_delta_pct?: number
}

interface Alert {
  id: string
  type: 'critical' | 'warning' | 'info'
  title: string
  subtitle: string
  action: string
  action_url: string
}

interface ChannelPerf {
  channel_id: number
  channel_name: string
  dispatches_7d: number
  ctr_7d: number
}

interface Product {
  id: number
  canonical_name?: string
  title?: string
  marketplace?: string
  lowest_price?: number
  price?: number
  image_url?: string
}

// ── Componentes ─────────────────────────────────────────

const alertIcon: Record<string, string> = { critical: '🔴', warning: '🟡', info: '🔵' }

function AlertItem({ alert, onDismiss }: { alert: Alert; onDismiss: (id: string) => void }) {
  const navigate = useNavigate()
  return (
    <div className={`flex items-start gap-3 p-3 rounded-md border ${
      alert.type === 'critical'
        ? 'bg-danger/5 border-danger/30'
        : alert.type === 'warning'
        ? 'bg-warning/5 border-warning/30'
        : 'bg-surface border-border'
    }`}>
      <span className="text-base flex-shrink-0 mt-0.5">{alertIcon[alert.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg">{alert.title}</p>
        <p className="text-xs text-fg-3 mt-0.5">{alert.subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate(alert.action_url)}
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          {alert.action} →
        </button>
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          className="text-fg-3 hover:text-fg text-sm leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [feed, setFeed] = React.useState<Product[]>([])
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())

  const hora = new Date().getHours()
  const greeting = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const { data: kpis } = useQuery<KPIs>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => apiClient.get('/api/dashboard/kpis?period=24h').then(r => r.data).catch(() => ({})),
    refetchInterval: 60_000,
  })

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<Alert[]>({
    queryKey: ['dashboard', 'inbox'],
    queryFn: () => apiClient.get('/api/dashboard/inbox').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 30_000,
  })

  const { data: performance = [] } = useQuery<ChannelPerf[]>({
    queryKey: ['dashboard', 'performance'],
    queryFn: () => apiClient.get('/api/dashboard/performance').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 120_000,
  })

  const { data: catalogData, isLoading: loadingFeed } = useQuery({
    queryKey: ['catalog', { limit: 20, dashboard: true }],
    queryFn: () => apiClient.get('/api/catalog?limit=20').then(r => r.data).catch(() => []),
  })

  useWSEvent('product.new', (data) => {
    setFeed(prev => [data.product as unknown as Product, ...prev].slice(0, 50))
  })

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id))
  const products: Product[] = feed.length > 0 ? feed : (Array.isArray(catalogData) ? catalogData : (catalogData?.items ?? []))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">{greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
          <p className="text-sm text-fg-3 mt-0.5">
            {visibleAlerts.length > 0
              ? `${visibleAlerts.length} ${visibleAlerts.length === 1 ? 'item precisa' : 'itens precisam'} da sua atenção`
              : 'Tudo em ordem'}
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

      {/* Inbox alertas */}
      {(loadingAlerts || visibleAlerts.length > 0) && (
        <div className="bg-surface border border-border rounded-md p-4 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {visibleAlerts.length > 0 && (
                <span className="bg-danger text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {visibleAlerts.length}
                </span>
              )}
              <p className="text-sm font-medium text-fg">Precisa de você · inbox da operação</p>
            </div>
            {visibleAlerts.length > 1 && (
              <button
                type="button"
                onClick={() => setDismissed(new Set(alerts.map(a => a.id)))}
                className="text-xs text-accent hover:underline"
              >
                Resolver tudo →
              </button>
            )}
          </div>
          {loadingAlerts ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            visibleAlerts.slice(0, 4).map(alert => (
              <AlertItem key={alert.id} alert={alert} onDismiss={id => setDismissed(prev => new Set([...prev, id]))} />
            ))
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" className="text-left" onClick={() => navigate('/logs')}>
          <KpiCard label="Disparos 7d" value={kpis?.dispatches_24h ?? '—'} delta={kpis?.dispatches_delta_pct != null ? { value: kpis.dispatches_delta_pct, label: 'vs sem. anterior' } : undefined} />
        </button>
        <button type="button" className="text-left" onClick={() => navigate('/logs')}>
          <KpiCard label="Cliques 7d" value={kpis?.clicks_24h ?? '—'} delta={kpis?.clicks_delta_pct != null ? { value: kpis.clicks_delta_pct, label: 'únicos' } : undefined} />
        </button>
        <KpiCard label="Receita 7d" value={kpis?.revenue_24h ? `R$ ${Number(kpis.revenue_24h).toFixed(0)}` : '—'} />
        <KpiCard label="CTR médio" value={kpis?.conversion_pct ? `${Number(kpis.conversion_pct).toFixed(1)}%` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feed + performance */}
        <div className="lg:col-span-2 space-y-6">
          {/* Performance por canal */}
          {performance.length > 0 && (
            <div className="bg-surface border border-border rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-fg">Performance por canal · 7 dias</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Canal</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Disparos</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map(p => (
                    <tr key={p.channel_id} className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer" onClick={() => navigate(`/channels/${p.channel_id}`)}>
                      <td className="px-4 py-2.5 font-medium text-fg">{p.channel_name}</td>
                      <td className="px-4 py-2.5 text-right text-fg">{p.dispatches_7d}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={p.ctr_7d > 0.05 ? 'text-success font-medium' : 'text-fg-2'}>
                          {p.ctr_7d > 0 ? `${(p.ctr_7d * 100).toFixed(1)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Feed de produtos */}
          <div>
            <p className="text-sm font-medium text-fg-2 mb-3">Produtos novos</p>
            {loadingFeed ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : products.length === 0 ? (
              <EmptyState title="Nenhum produto ainda" description="Configure um crawler para coletar produtos." cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }} />
            ) : (
              <div className="space-y-2">
                {products.slice(0, 15).map((p: any, i) => (
                  <div key={p.id ?? i} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-md hover:border-border-strong cursor-pointer transition-colors" onClick={() => navigate(`/match?productId=${p.id}`)}>
                    <div className="w-12 h-12 bg-surface-2 rounded-sm flex-shrink-0 overflow-hidden">
                      {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full text-xl">📦</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{p.canonical_name ?? p.title ?? 'Produto'}</p>
                      <div className="flex gap-1.5 mt-0.5 flex-wrap">
                        {p.lowest_price_source && <Badge size="sm">{p.lowest_price_source}</Badge>}
                        {((p.lowest_price ?? p.price) > 0) && <span className="text-xs text-fg-2">R$ {(p.lowest_price ?? p.price).toFixed(2)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-accent flex-shrink-0">Match →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-sm font-medium text-fg mb-3">Insights IA</p>
            <p className="text-sm text-fg-3 italic">Configure o LLM em <a href="/settings" className="text-accent hover:underline">Configurações → LLM / IA</a> para ver insights automáticos.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
