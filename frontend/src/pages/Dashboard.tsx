import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { KpiCard } from '../components/ui'
import { OperationInbox } from '../components/dashboard/OperationInbox'
import { RecommendationCard } from '../components/dashboard/RecommendationCard'
import { AdsSection } from '../components/dashboard/AdsSection'
import { ChannelPerformanceTable } from '../components/dashboard/ChannelPerformanceTable'
import { UpcomingDispatches, formatRelativeEta, type UpcomingDispatch } from '../components/dashboard/UpcomingDispatches'
import { apiClient } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import type { InboxItem } from '../components/dashboard/OperationInbox'

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


// ── Health score color helper ──────────────────────────────────────────────────

function healthScoreClass(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}

// ── Dynamic subtitle helper ────────────────────────────────────────────────────

function renderDynamicSubtitle(inboxCount: number, nextDispatchEta?: string) {
  if (inboxCount > 0 && nextDispatchEta) {
    return (
      <>
        <span className="text-danger font-medium">{inboxCount}</span> itens precisam da sua atenção · próximo disparo em {nextDispatchEta}
      </>
    )
  }
  if (inboxCount > 0) {
    return (
      <>
        <span className="text-danger">{inboxCount}</span> itens precisam da sua atenção
      </>
    )
  }
  if (nextDispatchEta) {
    return <>Tudo em ordem · próximo disparo em {nextDispatchEta}</>
  }
  return <>Tudo em ordem</>
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

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


  // Fetch inbox para contar itens
  const { data: inboxItems = [] } = useQuery<InboxItem[]>({
    queryKey: ['dashboard', 'inbox-v2'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/inbox')
        .then(r => (Array.isArray(r.data) ? (r.data as InboxItem[]) : []))
        .catch(() => []),
    refetchInterval: 30_000,
  })

  // Fetch upcoming dispatches para pegar primeira ETA
  const { data: dispatches = [] } = useQuery<UpcomingDispatch[]>({
    queryKey: ['dashboard', 'upcoming-dispatches'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/upcoming-dispatches?limit=5')
        .then(r => (Array.isArray(r.data) ? (r.data as UpcomingDispatch[]) : []))
        .catch(() => []),
    refetchInterval: 60_000,
  })


  // Use backend KPIs or null if not available
  const resolvedKpis = kpis ?? null

  // Disparos 7D
  const dispatches7d = resolvedKpis?.dispatches_24h ?? '—'
  const dispatchesDelta = resolvedKpis?.dispatches_delta_pct

  // CTR médio
  const ctrAvg = resolvedKpis?.conversion_pct
  const ctrDelta = resolvedKpis?.ctr_avg_pp_delta

  // Cliques 7D
  const clicks7d = resolvedKpis?.clicks_24h ?? '—'
  const uniqueClicks = resolvedKpis?.unique_clicks

  // Saúde anti-ban
  const healthScore = resolvedKpis?.health_score
  const accountsNormal = resolvedKpis?.accounts_normal_count

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            {greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          {/* Subtítulo dinâmico — renderizado com base em inboxCount + nextDispatchEta */}
          <p className="text-sm text-fg-3 mt-0.5" id="dashboard-subtitle">
            {renderDynamicSubtitle(
              inboxItems.length,
              dispatches.length > 0 ? formatRelativeEta(dispatches[0].scheduled_at) : undefined
            )}
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

      {/* ── 2. Recomendação operacional (cache 1h) ──────────────────────────── */}
      <RecommendationCard />

      {/* ── 3. OperationInbox ───────────────────────────────────────────────── */}
      <OperationInbox />

      {/* ── 4. Anúncios recorrentes ─────────────────────────────────────────── */}
      <AdsSection />

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


    </div>
  )
}
