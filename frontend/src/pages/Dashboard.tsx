import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, KpiCard, PageHeader, toast } from '../components/ui'
import { OperationInbox } from '../components/dashboard/OperationInbox'
import { RecommendationCard } from '../components/dashboard/RecommendationCard'
import { LastReportCard } from '../components/dashboard/LastReportCard'
import { AlertsStrip } from '../components/dashboard/AlertsStrip'
import { SubsystemStatus } from '../components/dashboard/SubsystemStatus'
import { apiClient } from '../lib/apiClient'
import { fetchHealthFull } from '../lib/api/health'
import { useAuth } from '../lib/auth'
import { pageContainer, responsiveKpiGrid } from '../lib/uiTokens'
import type { InboxItem } from '../components/dashboard/OperationInbox'
import type { HealthFull } from '../lib/api/health'

// ── Tipos ──────────────────────────────────────────────────────────────────────

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

function renderDynamicSubtitle(inboxCount: number, alertUrgentCount?: number, nextDispatchEta?: string) {
  const urgentAlerts = alertUrgentCount ?? 0
  const totalAttention = inboxCount + urgentAlerts

  if (totalAttention > 0 && nextDispatchEta) {
    return (
      <>
        <span className="text-danger font-medium">{totalAttention}</span> itens precisam da sua atenção · próximo disparo em {nextDispatchEta}
      </>
    )
  }
  if (totalAttention > 0) {
    return (
      <>
        <span className="text-danger">{totalAttention}</span> itens precisam da sua atenção
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

  const { data: healthFull, dataUpdatedAt: healthUpdatedAt } = useQuery<HealthFull>({
    queryKey: ['health', 'full'],
    queryFn: fetchHealthFull,
    refetchInterval: 30_000,
  })

  const alertas = healthFull?.alertas ?? []
  const alertUrgentCount = alertas.filter(
    a => a.severity === 'critical' || a.severity === 'warning',
  ).length

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

  // Gera o relatório de métricas do dia AGORA e dispara pro grupo de alertas (WhatsApp).
  // Ao concluir, invalida a query do card "Último relatório" pra ele atualizar na hora.
  const reportMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/dashboard/report-now')
        .then(r => r.data as { ok: boolean; preview: string; sent_to_group: boolean }),
    onSuccess: data => {
      if (data.sent_to_group) {
        toast('Relatório gerado e enviado pro grupo de alertas ✅', 'ok')
      } else {
        toast('Relatório gerado, mas não há grupo de alertas configurado (Configurações → Notificações).', 'warn')
      }
      qc.invalidateQueries({ queryKey: ['dashboard', 'last-report'] })
    },
    onError: () => toast('Falha ao gerar o relatório.', 'error'),
  })

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['dashboard', 'kpis'] })
    qc.invalidateQueries({ queryKey: ['dashboard', 'inbox-v2'] })
    qc.invalidateQueries({ queryKey: ['health', 'full'] })
    qc.invalidateQueries({ queryKey: ['catalog'] })
  }

  const firstName = user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'você'

  return (
    <div className={`${pageContainer} space-y-6`}>

      {/* ── 1. Cabeçalho ────────────────────────────────────────────────────── */}
      <PageHeader
        title={`Bom dia, ${firstName}`}
        subtitleId="dashboard-subtitle"
        subtitle={renderDynamicSubtitle(inboxItems.length, alertUrgentCount)}
        actions={
          <>
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

      {/* ── 2. Alertas de saúde ──────────────────────────────────────────────── */}
      <AlertsStrip items={alertas} />

      {/* ── 3. Status dos subsistemas ────────────────────────────────────────── */}
      {healthFull && <SubsystemStatus data={healthFull} now={healthUpdatedAt} />}

      {/* ── 4. Quick actions ─────────────────────────────────────────────────── */}
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
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={reportMutation.isPending}
          onClick={() => reportMutation.mutate()}
        >
          {reportMutation.isPending ? '⏳ Gerando…' : '📊 Gerar relatório'}
        </Button>
      </div>

      {/* ── 4b. Último relatório diário (referência) ─────────────────────────── */}
      <LastReportCard />

      {/* ── 5. KPIs — responsivos (2 col mobile / 4 col desktop) ─────────────── */}
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

      {/* ── 6. Inbox | dica LLM ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <OperationInbox />
        <RecommendationCard />
      </div>

    </div>
  )
}
