import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, KpiCard, Switch, PageHeader } from '../components/ui'
import { OperationInbox } from '../components/dashboard/OperationInbox'
import { RecommendationCard } from '../components/dashboard/RecommendationCard'
import { ChannelPerformanceTable } from '../components/dashboard/ChannelPerformanceTable'
import { UpcomingDispatches, formatRelativeEta, type UpcomingDispatch } from '../components/dashboard/UpcomingDispatches'
import { apiClient } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { pageContainer, responsiveKpiGrid } from '../lib/uiTokens'
import type { InboxItem } from '../components/dashboard/OperationInbox'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface JonfreyConfigLite {
  enabled: boolean
  interval_minutes?: number
  last_run_at?: string | null
}

interface KPIs {
  dispatches_24h?: number
  clicks_24h?: number
  revenue_24h?: number
  conversion_pct?: number
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

  const { data: kpis } = useQuery<KPIs>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/kpis?period=7d')
        .then(r => r.data as KPIs)
        .catch(() => ({} as KPIs)),
    refetchInterval: 60_000,
  })

  const { data: inboxItems = [] } = useQuery<InboxItem[]>({
    queryKey: ['dashboard', 'inbox-v2'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/inbox')
        .then(r => (Array.isArray(r.data) ? (r.data as InboxItem[]) : []))
        .catch(() => []),
    refetchInterval: 30_000,
  })

  const { data: dispatches = [] } = useQuery<UpcomingDispatch[]>({
    queryKey: ['dashboard', 'upcoming-dispatches'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/upcoming-dispatches?limit=5')
        .then(r => (Array.isArray(r.data) ? (r.data as UpcomingDispatch[]) : []))
        .catch(() => []),
    refetchInterval: 60_000,
  })

  const { data: jonfreyConfig } = useQuery<JonfreyConfigLite | null>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
  })

  const jonfreyPilotMut = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.put('/api/jonfrey/config', { enabled }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao atualizar Auto-pilot')
    },
  })

  const resolvedKpis = kpis ?? null
  const dispatches7d = resolvedKpis?.dispatches_24h ?? '—'
  const dispatchesDelta = resolvedKpis?.dispatches_delta_pct
  const ctrAvg = resolvedKpis?.conversion_pct
  const ctrDelta = resolvedKpis?.ctr_avg_pp_delta
  const clicks7d = resolvedKpis?.clicks_24h ?? '—'
  const uniqueClicks = resolvedKpis?.unique_clicks
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

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['dashboard', 'kpis'] })
    qc.invalidateQueries({ queryKey: ['dashboard', 'inbox-v2'] })
    qc.invalidateQueries({ queryKey: ['dashboard', 'upcoming-dispatches'] })
    qc.invalidateQueries({ queryKey: ['catalog'] })
    qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
  }

  const nextDispatchEta =
    dispatches.length > 0 ? formatRelativeEta(dispatches[0].scheduled_at) : undefined

  const firstName = user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'você'

  return (
    <div className={`${pageContainer} space-y-6`}>

      {/* ── 1. Cabeçalho ────────────────────────────────────────────────────── */}
      <PageHeader
        title={`Bom dia, ${firstName}`}
        subtitleId="dashboard-subtitle"
        subtitle={renderDynamicSubtitle(inboxItems.length, nextDispatchEta)}
        actions={
          <>
            <div
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5"
              title="Ciclo agendado do Jonfrey"
            >
              <span className="text-xs text-fg-2 whitespace-nowrap">Auto-pilot</span>
              <Switch
                checked={jonfreyConfig?.enabled ?? false}
                disabled={jonfreyPilotMut.isPending || jonfreyConfig == null}
                onChange={v => jonfreyPilotMut.mutate(v)}
              />
              <button
                type="button"
                className="text-[11px] text-accent hover:underline whitespace-nowrap"
                onClick={() => navigate('/activity?tab=jonfrey')}
              >
                config →
              </button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={handleRefresh}
            >
              ↻ Atualizar
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => navigate('/compose')}
            >
              ✈ Novo disparo
            </Button>
          </>
        }
      />

      {/* ── 2. Quick actions ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" type="button" onClick={() => navigate('/compose')}>
          ✈ Compor
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={() => navigate('/accounts')}>
          + Conectar conta
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => navigate('/activity')}>
          Ver activity →
        </Button>
      </div>

      {/* ── 3. KPIs — responsivos (2 col mobile / 4 col desktop) ─────────────── */}
      <div className={responsiveKpiGrid}>
        <button type="button" className="text-left w-full" onClick={() => navigate('/activity?filter=dispatches')}>
          <KpiCard
            label="Disparos · 7D"
            value={dispatches7d}
            delta={
              dispatchesDelta !== undefined
                ? {
                    displayText: `${dispatchesDelta >= 0 ? '↑' : '↓'}${Math.abs(dispatchesDelta)}% vs semana anterior`,
                    tone: dispatchesDelta >= 0 ? 'success' : 'danger',
                  }
                : undefined
            }
          />
        </button>

        <KpiCard
          label="CTR Médio"
          value={ctrAvg !== undefined ? `${Number(ctrAvg).toFixed(1)}%` : '—'}
          delta={
            ctrDelta !== undefined
              ? {
                  displayText: `${ctrDelta >= 0 ? '↑' : '↓'}${Math.abs(ctrDelta).toFixed(1)} pp`,
                  tone: ctrDelta >= 0 ? 'success' : 'danger',
                }
              : undefined
          }
        />

        <button type="button" className="text-left w-full" onClick={() => navigate('/activity?filter=clicks')}>
          <KpiCard
            label="Cliques · 7D"
            value={clicks7d}
            subtitle={uniqueClicks !== undefined ? `${uniqueClicks.toLocaleString('pt-BR')} únicos` : undefined}
          />
        </button>

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

      {/* ── 4. Inbox | dica LLM ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <OperationInbox />
        <RecommendationCard />
      </div>

      {/*
        Antes vinha aqui um <JonfreyDispatchReviewCard />. A lista mudou
        de casa: agora é uma aba dedicada em /auto-match → "Jonfrey Check".
        O contador de anomalias aparece no nome da aba e o grupo de
        notificações continua recebendo o resumo automaticamente.
      */}

      {/* ── 5. Performance | Próximos disparos ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChannelPerformanceTable />
        <UpcomingDispatches />
      </div>

    </div>
  )
}
