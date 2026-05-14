import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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

// ── Score Engine Status Widget ──────────────────────────────────────────────

interface AlgoStatus {
  state: 'disabled' | 'paused' | 'error' | 'ok'
  last_tick_at?: string
  last_enqueued?: number
  last_error?: string
  tick_duration_ms?: number
  in_send_window: boolean
  use_algo_tick: boolean
  next_tick_seconds: number
}

const STATE_CONFIG = {
  disabled: { label: 'Desligado',   dot: 'bg-fg-3',     text: 'text-fg-3',    border: 'border-border' },
  paused:   { label: 'Pausado',     dot: 'bg-warning',   text: 'text-warning', border: 'border-warning/30' },
  error:    { label: 'Com erro',    dot: 'bg-danger',    text: 'text-danger',  border: 'border-danger/30' },
  ok:       { label: 'Aguardando',  dot: 'bg-success',   text: 'text-success', border: 'border-success/30' },
} as const

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    setRemaining(seconds)
    const id = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds])
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface DryRunGroup {
  group_id: number
  group_name: string
  channel_name?: string
  blocked: boolean
  reason: string
  daily_msg_cap: number
  sent_today: number
  candidates_found: number
  has_modem: boolean
}

interface DryRunResult {
  total_groups: number
  would_enqueue: number
  blocked: number
  catalog_send_ready: number
  send_queue_exists: boolean
  groups: DryRunGroup[]
}

function AlgoStatusWidget() {
  const qc = useQueryClient()
  const [showDryRun, setShowDryRun] = useState(false)

  const { data: status } = useQuery<AlgoStatus>({
    queryKey: ['algo-status'],
    queryFn: () => apiClient.get('/api/admin/algo/status').then(r => r.data),
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: dryRun, isFetching: dryRunLoading } = useQuery<DryRunResult>({
    queryKey: ['algo-dry-run'],
    queryFn: () => apiClient.get('/api/admin/algo/dry-run').then(r => r.data),
    enabled: showDryRun,
    staleTime: 30_000,
  })

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.post('/api/admin/algo/toggle', { enabled }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['algo-status'] })
    },
  })

  const countdown = useCountdown(status?.next_tick_seconds ?? 0)
  const cfg = status ? STATE_CONFIG[status.state] : STATE_CONFIG.disabled
  const showToggle = status && (status.state === 'ok' || status.state === 'disabled')

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${cfg.border} bg-surface px-4 py-3`}>
      {/* Dot pulsante */}
      <span className="relative mt-0.5 flex-shrink-0">
        <span className={`block h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
        {status?.state === 'ok' && (
          <span className={`absolute inset-0 rounded-full ${cfg.dot} animate-ping opacity-60`} />
        )}
      </span>

      {/* Corpo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
          {status?.state === 'ok' && (
            <span className="text-xs text-fg-3">
              próximo tick em <span className="font-mono text-fg-2">{countdown}</span>
              {status.last_enqueued !== undefined && status.last_enqueued !== null && (
                <> · {status.last_enqueued} grupo{status.last_enqueued !== 1 ? 's' : ''} no último</>
              )}
            </span>
          )}
          {status?.state === 'paused' && (
            <span className="text-xs text-fg-3">
              fora da janela de envio configurada em Settings
            </span>
          )}
          {status?.state === 'disabled' && (
            <span className="text-xs text-fg-3">
              Score Engine desligado — nenhuma mensagem automática será enviada
            </span>
          )}
        </div>

        {/* Erro expandido */}
        {status?.state === 'error' && status.last_error && (
          <p className="mt-1 text-xs font-mono text-danger bg-danger/8 rounded px-2 py-1 break-all">
            {status.last_error}
          </p>
        )}

        {/* Dry-run inline — aparece quando está ok mas nenhum grupo enviou */}
        {status?.state === 'ok' && status.last_enqueued === 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowDryRun(v => !v)}
              className="text-[11px] text-warning hover:text-fg underline"
            >
              {showDryRun ? 'ocultar diagnóstico ↑' : 'ver diagnóstico grupo a grupo →'}
            </button>

            {showDryRun && (
              <div className="mt-2 border border-border rounded-md bg-surface-2 overflow-hidden">
                {dryRunLoading && (
                  <p className="px-3 py-2 text-xs text-fg-3">Carregando…</p>
                )}
                {dryRun && (
                  <>
                    <div className="px-3 py-1.5 border-b border-border text-xs text-fg-3 flex gap-4">
                      <span>Catálogo send_ready: <b className="text-fg">{dryRun.catalog_send_ready}</b></span>
                      <span>Grupos bloqueados: <b className="text-danger">{dryRun.blocked}</b></span>
                      <span>Enfileiraria: <b className="text-success">{dryRun.would_enqueue}</b></span>
                    </div>
                    <div className="divide-y divide-border max-h-64 overflow-y-auto">
                      {dryRun.groups.map(g => (
                        <div key={g.group_id} className="px-3 py-1.5 flex items-start gap-2">
                          <span className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${g.blocked ? 'bg-danger' : 'bg-success'}`} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-fg">{g.group_name}</span>
                            {g.channel_name && <span className="text-xs text-fg-3 ml-1">({g.channel_name})</span>}
                            <p className="text-[11px] text-fg-3 mt-0.5">{g.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Last tick info quando não é erro */}
        {status?.last_tick_at && status.state !== 'error' && (
          <p className="mt-0.5 text-[11px] text-fg-3">
            último tick às {new Date(status.last_tick_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {status.tick_duration_ms !== undefined && ` (${status.tick_duration_ms}ms)`}
          </p>
        )}
      </div>

      {/* Toggle */}
      {showToggle && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-fg-3">{status.use_algo_tick ? 'Desligar' : 'Ligar'}</span>
          <Switch
            checked={status.use_algo_tick}
            disabled={toggleMut.isPending}
            onChange={v => toggleMut.mutate(v)}
          />
        </div>
      )}
    </div>
  )
}

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

      {/* ── 3.5 Score Engine Status ──────────────────────────────────────────── */}
      <AlgoStatusWidget />

      {/* ── 4. Inbox | dica LLM ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <OperationInbox />
        <RecommendationCard />
      </div>

      {/*
        Antes vinha aqui um <JonfreyDispatchReviewCard />. A lista mudou
        de casa: agora é uma aba dedicada em /automations → "Jonfrey Check".
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
