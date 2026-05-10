import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { KpiCard, Skeleton, Switch, Badge, TooltipIcon, Button } from '../components/ui'
import { FullAutoStatusBanner } from '../components/FullAutoStatusBanner'
import { ChannelDetailInner } from './ChannelDetail'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ChannelAutomation {
  id?: number
  channel_id: number
  enabled: boolean
  auto_match_enabled: boolean
  threshold?: number | null
  max_per_run?: number | null
  cooldown_hours: number
  events_enabled: boolean
  notify_new: boolean
  notify_drop: boolean
  notify_lowest: boolean
  drop_threshold: number
  match_type: string
  match_value?: string | null
  max_price?: number | null
  paused_until?: string | null
  created_at?: string
  updated_at?: string
}

export interface ChannelRow {
  channel_id: number
  channel_name: string
  automation: ChannelAutomation | null
}

interface AutoMatchLog {
  id: number
  product_id: number
  channel_id: number
  dispatch_id: number
  score: number
  created_at: string
  product_name?: string
  channel_name?: string
  group_names?: string // CSV dos grupos que receberam
}

interface GlobalPreviewItem {
  product_id: number
  channel_id: number
  product_name: string
  channel_name: string
  score: number
  already_sent: boolean
}

interface AutoMatchStatus {
  enabled: boolean
  threshold: number
  max_per_run: number
  logs: AutoMatchLog[]
  last_run_at: string | null
  interval_seconds: number
}

interface PendingDispatchFull {
  id: number
  status: string
  composed_by: string
  affiliate_link: string
  channel_id?: number
  channel_name?: string
  product_name?: string
  product_image?: string
  price?: number
  source?: string
  brand?: string
  score?: number
  message_text: string
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtScore(s: number): string {
  return s.toFixed(0)
}

/** Próximo tick do auto-match estritamente no futuro (last_run + k×interval). */
function computeNextAutoMatchTickMs(lastRunISO: string | null | undefined, intervalSeconds: number): number | null {
  if (lastRunISO == null || intervalSeconds <= 0) return null
  const intervalMs = intervalSeconds * 1000
  let t = new Date(lastRunISO).getTime()
  if (!Number.isFinite(t)) return null
  const now = Date.now()
  while (t <= now) {
    t += intervalMs
  }
  return t
}

/** Countdown legível (evita "2757s" sem contexto). */
function fmtEtaSeconds(secs: number | null): string {
  if (secs == null) return '—'
  const s = Math.max(0, Math.floor(secs))
  if (s === 0) return 'agora'
  if (s < 90) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m >= 120) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    return `${h}h ${mm}min`
  }
  return r === 0 ? `${m} min` : `${m}min ${r}s`
}

const TIMELINE_LOG_CAP = 25

const SOURCE_LABEL: Record<string, string> = {
  amz: 'Amazon',
  amazon: 'Amazon',
  ml: 'Mercado Livre',
  mercadolivre: 'Mercado Livre',
  magalu: 'Magalu',
  shopee: 'Shopee',
  aliexpress: 'AliExpress',
  casasbahia: 'Casas Bahia',
  kabum: 'Kabum',
  americanas: 'Americanas',
}

// ── Toggle inline de master switch ──────────────────────────────────────────

function MasterToggle({ row }: { row: ChannelRow }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (enabled: boolean) => {
      const current = row.automation ?? defaultAutomation(row.channel_id)
      return apiClient
        .put(`/api/automations/${row.channel_id}`, { ...current, enabled, auto_match_enabled: enabled })
        .then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  return (
    <Switch
      checked={row.automation?.enabled ?? false}
      disabled={mut.isPending}
      onChange={(v) => mut.mutate(v)}
    />
  )
}

// Default para criação de nova automação
function defaultAutomation(channelId: number): ChannelAutomation {
  return {
    channel_id: channelId,
    enabled: false,
    auto_match_enabled: false,
    threshold: null,
    max_per_run: null,
    cooldown_hours: 6,
    events_enabled: false,
    notify_new: true,
    notify_drop: true,
    notify_lowest: false,
    drop_threshold: 0.1,
    match_type: 'all',
    match_value: null,
    max_price: null,
    paused_until: null,
  }
}

// ── Drawer — mesma UI da página /channels/:id (tabs unificados) ───────────────

interface DrawerProps {
  row: ChannelRow
  onClose: () => void
}

export function Drawer({ row, onClose }: DrawerProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 right-0 w-full max-w-[56rem] bg-surface border-l border-border z-50 flex flex-col shadow-xl min-h-0">
        <ChannelDetailInner channelId={String(row.channel_id)} embedded onClose={onClose} />
      </div>
    </>
  )
}

// ── Aba Visao Geral ──────────────────────────────────────────────────────────

function relativeFromNow(s: string): string {
  const ms = Date.now() - new Date(s).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function TabOverview() {
  const qc = useQueryClient()
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  const { data } = useQuery<AutoMatchStatus>({
    queryKey: ['auto-match'],
    queryFn: () => apiClient.get('/api/auto-match').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const { data: appConfig } = useQuery<{ full_auto_mode?: boolean } & Record<string, unknown>>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
    staleTime: 60_000,
  })
  const fullAutoMode = !!appConfig?.full_auto_mode

  const toggleFullAuto = useMutation({
    mutationFn: async (v: boolean) => {
      try {
        await apiClient.put('/api/config', { ...appConfig, full_auto_mode: v })
      } catch {
        /* ignore */
      }
      if (v) {
        try {
          await apiClient.post('/api/jonfrey/run', { action_type: 'enable_full_auto' })
        } catch {
          /* ignore */
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
    },
  })

  /** Mesmo tick que o cron (~15s); opcional após aprovar para não esperar o próximo ciclo. */
  const tickDispatchQueue = () =>
    apiClient.post('/api/dispatches/process-queue-now').catch(() => null)

  const processQueueMut = useMutation({
    mutationFn: () => apiClient.post('/api/dispatches/process-queue-now'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-match'] })
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
      qc.invalidateQueries({ queryKey: ['work-queue'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? err?.message ?? 'Erro ao processar fila'),
  })

  const approveAllMut = useMutation({
    mutationFn: async () => {
      await apiClient.post('/api/dispatches/approve-all')
      await tickDispatchQueue()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-match'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
    },
  })

  const approveBatchMut = useMutation({
    mutationFn: async (ids: number[]) => {
      try {
        const r = await apiClient.post('/api/dispatches/approve-batch', { ids })
        await tickDispatchQueue()
        return r
      } catch (err: any) {
        if (err?.response?.status === 404) {
          await Promise.allSettled(ids.map(id => apiClient.post(`/api/dispatches/${id}/approve`)))
          await tickDispatchQueue()
          return { data: { approved: ids.length } }
        }
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
      qc.invalidateQueries({ queryKey: ['auto-match'] })
      setSelected(new Set())
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao aprovar'),
  })

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] }),
  })

  const rejectBatchMut = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.allSettled(ids.map(id => apiClient.post(`/api/dispatches/${id}/reject`)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
      setSelected(new Set())
    },
  })

  const { data: pendingList = [], isLoading: pendingLoading } = useQuery<PendingDispatchFull[]>({
    queryKey: ['dispatches', 'pending-approval'],
    queryFn: () => apiClient.get('/api/dispatches/pending-approval').then(r => (Array.isArray(r.data) ? r.data : []) as PendingDispatchFull[]).catch(() => []),
    refetchInterval: 15_000,
  })
  const pendingCount = pendingList.length

  const toggleMut = useMutation({
    mutationFn: async (payload: Partial<{ enabled: boolean; threshold: number; max_per_run: number }>) => {
      const tasks: Promise<unknown>[] = [apiClient.post('/api/auto-match/toggle', payload)]
      if (payload.enabled !== undefined) {
        tasks.push(apiClient.put('/api/jonfrey/config', { enabled: payload.enabled }).catch(() => null))
      }
      const [r] = await Promise.all(tasks)
      return (r as any)?.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-match'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
      qc.invalidateQueries({ queryKey: ['auto-match', 'preview'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const { data: jonfreyConfig } = useQuery<{ enabled: boolean; interval_minutes: number; last_run_at?: string | null }>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
  })

  const { data: nextCyclePreview } = useQuery<{
    items: GlobalPreviewItem[]
    auto_match_master_enabled?: boolean
    max_per_run?: number
  }>({
    queryKey: ['auto-match', 'preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data).catch(() => ({ items: [] })),
    refetchInterval: 60_000,
  })

  const previewCandidates = React.useMemo(
    () => (nextCyclePreview?.items ?? []).filter((i) => !i.already_sent),
    [nextCyclePreview],
  )

  const [localThreshold, setLocalThreshold] = React.useState<number | null>(null)
  const [localMaxPerRun, setLocalMaxPerRun] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (data) {
      if (localThreshold === null) setLocalThreshold(data.threshold)
      if (localMaxPerRun === null) setLocalMaxPerRun(data.max_per_run)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = data?.enabled ?? false
  const threshold = localThreshold ?? data?.threshold ?? 50
  const maxPerRunCfg = localMaxPerRun ?? data?.max_per_run ?? 3
  const logs = data?.logs ?? []

  const now = Date.now()
  const h24ago = now - 24 * 3600 * 1000
  const dispatches24h = logs.filter(l => new Date(l.created_at).getTime() > h24ago).length

  const fullyEnabled = enabled && (jonfreyConfig?.enabled ?? false)

  const nextAutoMatchMs = React.useMemo(
    () =>
      data?.interval_seconds != null ? computeNextAutoMatchTickMs(data.last_run_at ?? null, data.interval_seconds) : null,
    [data?.last_run_at, data?.interval_seconds],
  )

  const [amSecs, setAmSecs] = React.useState<number | null>(null)
  React.useEffect(() => {
    const tick = () => {
      if (nextAutoMatchMs == null) {
        setAmSecs(null)
        return
      }
      setAmSecs(Math.max(0, Math.round((nextAutoMatchMs - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nextAutoMatchMs])

  const jonfreyIntervalMs = Math.max(1, jonfreyConfig?.interval_minutes ?? 60) * 60 * 1000
  const [jfSecs, setJfSecs] = React.useState<number | null>(null)
  React.useEffect(() => {
    const tick = () => {
      if (!jonfreyConfig?.enabled) {
        setJfSecs(null)
        return
      }
      const base = jonfreyConfig.last_run_at ? new Date(jonfreyConfig.last_run_at).getTime() : 0
      const next = base > 0 ? base + jonfreyIntervalMs : Date.now() + jonfreyIntervalMs
      setJfSecs(Math.max(0, Math.round((next - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [jonfreyConfig?.enabled, jonfreyConfig?.last_run_at, jonfreyIntervalMs])

  const autoMatchCountLabel =
    amSecs === null
      ? enabled && data?.last_run_at == null
        ? 'sem log ainda'
        : '—'
      : amSecs === 0
        ? 'agora'
        : `${amSecs}s`

  const maxPerRunEffective = Math.max(1, nextCyclePreview?.max_per_run ?? data?.max_per_run ?? 3)
  const intervalSecAm = data?.interval_seconds ?? 60

  const previewRankInChannel = React.useMemo(() => {
    const byChannel = new Map<number, GlobalPreviewItem[]>()
    for (const i of previewCandidates) {
      const arr = byChannel.get(i.channel_id) ?? []
      arr.push(i)
      byChannel.set(i.channel_id, arr)
    }
    const rankMap = new Map<string, number>()
    for (const [, arr] of byChannel) {
      arr.sort((a, b) => b.score - a.score || a.product_id - b.product_id)
      arr.forEach((item, idx) => {
        rankMap.set(`${item.channel_id}-${item.product_id}`, idx + 1)
      })
    }
    return rankMap
  }, [previewCandidates])

  const previewQueueLabel = (p: GlobalPreviewItem): string => {
    if (!enabled) return '—'
    const rank = previewRankInChannel.get(`${p.channel_id}-${p.product_id}`) ?? 1
    return `${rank}º no canal · máx ${maxPerRunEffective}/ciclo`
  }

  const isInThisAutoMatchCycle = React.useCallback(
    (p: GlobalPreviewItem): boolean => {
      if (!enabled) return false
      const rank = previewRankInChannel.get(`${p.channel_id}-${p.product_id}`) ?? 999
      return rank <= maxPerRunEffective
    },
    [enabled, previewRankInChannel, maxPerRunEffective],
  )

  /** Neste ciclo primeiro; depois restantes (mesma ordem por canal/rank). */
  const previewRowsSorted = React.useMemo(() => {
    const arr = [...previewCandidates]
    arr.sort((a, b) => {
      const ia = isInThisAutoMatchCycle(a)
      const ib = isInThisAutoMatchCycle(b)
      if (ia !== ib) return ia ? -1 : 1
      const ra = previewRankInChannel.get(`${a.channel_id}-${a.product_id}`) ?? 999
      const rb = previewRankInChannel.get(`${b.channel_id}-${b.product_id}`) ?? 999
      if (a.channel_id !== b.channel_id) return a.channel_id - b.channel_id
      return ra - rb
    })
    return arr
  }, [previewCandidates, previewRankInChannel, isInThisAutoMatchCycle])

  const logsSorted = React.useMemo(
    () => [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [logs],
  )

  type SortKey = 'channel' | 'source' | 'price' | 'score' | 'created_at'
  const [sortKey, setSortKey] = React.useState<SortKey>('created_at')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'created_at' ? 'desc' : 'asc')
    }
  }

  const sortedPending = React.useMemo(() => {
    const sorted = [...pendingList]
    sorted.sort((a, b) => {
      let av: any
      let bv: any
      switch (sortKey) {
        case 'channel':
          av = a.channel_name ?? ''
          bv = b.channel_name ?? ''
          break
        case 'source':
          av = a.source ?? ''
          bv = b.source ?? ''
          break
        case 'price':
          av = a.price ?? 0
          bv = b.price ?? 0
          break
        case 'score':
          av = a.score ?? 0
          bv = b.score ?? 0
          break
        case 'created_at':
          av = new Date(a.created_at).getTime()
          bv = new Date(b.created_at).getTime()
          break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [pendingList, sortKey, sortDir])

  const SortHeader = ({ k, label, align }: { k: SortKey; label: string; align?: string }) => (
    <th
      className={`px-3 py-2.5 text-xs font-medium text-fg-2 uppercase tracking-wide cursor-pointer select-none hover:text-fg ${align ?? 'text-left'}`}
      onClick={() => toggleSort(k)}
    >
      {label}
      {sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selected.size === pendingList.length) setSelected(new Set())
    else setSelected(new Set(pendingList.map(i => i.id)))
  }

  const renderLogRow = (log: AutoMatchLog) => {
    const groups = log.group_names ? log.group_names.split(', ').filter(Boolean) : []
    const groupsTitle = groups.length > 0 ? groups.join(', ') : undefined
    return (
      <div key={log.id} className="px-3 py-2 flex items-center gap-3 border-b border-border/80 last:border-0">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${log.score >= 70 ? 'bg-success/10 text-success' : log.score >= 50 ? 'bg-warning/10 text-warning' : 'bg-surface-2 text-fg-3'}`}>
          {fmtScore(log.score)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-fg truncate" title={groupsTitle}>
            {log.product_name || `Produto #${log.product_id}`}
          </p>
          <p className="text-[10px] text-fg-3 truncate">{log.channel_name ?? '—'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-medium text-success">Enviado</p>
          <p className="text-[10px] text-fg-3 whitespace-nowrap">{relativeFromNow(log.created_at)}</p>
          <a href={`/logs?dispatchId=${log.dispatch_id}`} className="text-[10px] text-accent hover:underline">
            rastrear
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <FullAutoStatusBanner
        placement="automations"
        trailing={
          <div className="flex flex-col items-end gap-2">
            <div
              className={`rounded-md border p-3 shadow-card transition-colors min-w-[14rem] ${
                fullyEnabled && fullAutoMode ? 'border-success/40 bg-surface' : fullyEnabled ? 'border-warning/40 bg-surface' : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <p className="text-[10px] text-fg-3 font-medium uppercase tracking-wide">Auto-pilot</p>
                  <p
                    className={`text-xs font-semibold mt-0.5 leading-snug ${fullyEnabled && fullAutoMode ? 'text-success' : fullyEnabled ? 'text-warning' : 'text-fg-2'}`}
                  >
                    {fullyEnabled && fullAutoMode ? 'Ativo · enviando' : fullyEnabled ? 'Ativo · aguardando aprovação' : 'Pausado'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={toggleMut.isPending || toggleFullAuto.isPending}
                  onClick={async () => {
                    const next = !fullyEnabled
                    await toggleMut.mutateAsync({ enabled: next })
                    if (next) await toggleFullAuto.mutateAsync(true)
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${fullyEnabled ? 'bg-accent' : 'bg-border'} disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fullyEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              {fullyEnabled && (pendingCount ?? 0) > 0 && !fullAutoMode && (
                <button
                  type="button"
                  disabled={approveAllMut.isPending}
                  onClick={() => approveAllMut.mutate()}
                  className="w-full mt-2 text-xs bg-accent text-white rounded px-2 py-1 hover:bg-accent/90 disabled:opacity-50"
                >
                  {approveAllMut.isPending ? 'Enviando…' : `Enviar ${pendingCount} pendentes`}
                </button>
              )}
            </div>
          </div>
        }
      />

      {!fullAutoMode && pendingList.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selected.size > 0 && (
            <>
              <Button
                variant="primary"
                size="sm"
                loading={approveBatchMut.isPending}
                onClick={() => approveBatchMut.mutate(Array.from(selected))}
              >
                ✓ Aprovar {selected.size}
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={rejectBatchMut.isPending}
                onClick={() => {
                  if (confirm(`Rejeitar ${selected.size} dispatches selecionados?`)) rejectBatchMut.mutate(Array.from(selected))
                }}
              >
                ✕ Rejeitar {selected.size}
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={approveAllMut.isPending}
            onClick={() => {
              if (confirm(`Aprovar TODOS os ${pendingList.length} pendentes?`)) approveAllMut.mutate()
            }}
          >
            Aprovar todos ({pendingList.length})
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={rejectBatchMut.isPending}
            onClick={() => {
              if (confirm(`Rejeitar TODOS os ${pendingList.length} pendentes?`)) rejectBatchMut.mutate(pendingList.map(i => i.id))
            }}
          >
            Rejeitar todos
          </Button>
        </div>
      ) : null}

      {/* ── KPI + thresholds ── */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 max-w-4xl">

        {/* Disparos 24h */}
        <KpiCard label="Disparos 24h" value={dispatches24h} subtitle="auto match"
          tooltip="Produtos disparados automaticamente pelo auto-match nas últimas 24h." />

        {/* Score mínimo + Max/ciclo juntos */}
        <div className="bg-surface border border-border rounded-md p-4 shadow-card space-y-3">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">Score mínimo</p>
              <TooltipIcon content="Afinidade mínima produto↔canal (0–100) para disparar. Score 50 = padrão conservador. Abaixe para mais volume, suba para mais qualidade." side="top" />
            </div>
            <input type="number" min={0} max={100} value={threshold}
              onChange={e => setLocalThreshold(Number(e.target.value))}
              onBlur={() => toggleMut.mutate({ threshold })}
              className="w-full text-sm font-bold border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">Max/ciclo</p>
              <TooltipIcon content="Máximo de produtos disparados por canal por ciclo. Evita spam: mesmo com 100 produtos elegíveis, só esse número sai por vez." side="top" />
            </div>
            <input type="number" min={1} max={20} value={maxPerRunCfg}
              onChange={e => setLocalMaxPerRun(Number(e.target.value))}
              onBlur={() => toggleMut.mutate({ max_per_run: maxPerRunCfg })}
              className="w-full text-sm font-bold border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
          </div>
        </div>
      </div>

      {/* Linha do tempo: envio WA + próximos (prévia) + enviados */}
      <div className="bg-surface border border-border rounded-lg shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-2/40 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">Quem entra na próxima janela · o que já foi disparado</p>
            <p className="text-[11px] text-fg-3 mt-1 max-w-3xl leading-relaxed">
              <strong className="text-fg-2">Auto-match</strong> é o ciclo que pode criar disparos;{' '}
              <strong className="text-fg-2">Jonfrey</strong> é outro relógio (manutenção do piloto). Nem todo ciclo gera envio — cooldown, URL, grupos e aprovação manual contam.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['auto-match'] })
              qc.invalidateQueries({ queryKey: ['auto-match', 'preview'] })
              qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
            }}
            className="text-xs text-fg-3 hover:text-fg shrink-0"
          >
            ↻ atualizar
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-2/15">
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-fg-3">Próximo ciclo auto-match</p>
            <p className="text-xl font-semibold text-fg tabular-nums mt-0.5">
              {!enabled ? 'desligado' : amSecs == null ? autoMatchCountLabel : fmtEtaSeconds(amSecs)}
            </p>
            <p className="text-[10px] text-fg-3 mt-1">Tick do worker a cada {intervalSecAm}s. Estimativa a partir do último ciclo registrado.</p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-fg-3">Próxima janela Jonfrey</p>
            <p className="text-xl font-semibold text-fg tabular-nums mt-0.5">
              {jonfreyConfig?.enabled === false ? 'piloto off' : jfSecs == null ? '—' : fmtEtaSeconds(jfSecs)}
            </p>
            <p className="text-[10px] text-fg-3 mt-1">Intervalo {jonfreyConfig?.interval_minutes ?? 60} min — não é o horário do WhatsApp.</p>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border bg-whatsapp/8 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">Envio da fila (WhatsApp)</p>
            <p className="text-[11px] text-fg-3 mt-0.5 leading-snug max-w-2xl">
              O servidor já corre o worker de envio periodicamente (~15s). Depois de aprovar ou libertar itens na fila, force aqui um envio em lote sem esperar o próximo ciclo.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            className="shrink-0"
            loading={processQueueMut.isPending}
            onClick={() => processQueueMut.mutate()}
          >
            Processar fila agora
          </Button>
        </div>

        <div className="max-h-[min(70vh,560px)] overflow-y-auto">
          {nextCyclePreview?.auto_match_master_enabled === false ? (
            <p className="px-4 py-6 text-sm text-center text-warning">Auto-match global desligado — ligue o Auto-pilot acima.</p>
          ) : previewCandidates.length === 0 ? (
            <p className="px-4 py-6 text-sm text-fg-3 text-center">
              Nenhum produto elegível na prévia (canais off, cooldown, threshold ou sem oferta).
            </p>
          ) : (
            <div className="divide-y divide-border/80">
              {previewRowsSorted.map((p) => {
                const inCycle = isInThisAutoMatchCycle(p)
                return (
                  <div
                    key={`${p.channel_id}-${p.product_id}`}
                    className={`px-3 py-2.5 flex items-center gap-3 transition-colors ${
                      inCycle
                        ? 'bg-accent/[0.07] border-l-[3px] border-l-accent pl-[9px]'
                        : 'bg-surface/40 border-l-[3px] border-l-transparent pl-[9px] opacity-90'
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-md shrink-0 min-w-[2.25rem] text-center ${
                        inCycle
                          ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                          : p.score >= 70
                            ? 'bg-warning/15 text-warning'
                            : 'bg-surface-2 text-fg-3'
                      }`}
                    >
                      {p.score.toFixed(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg truncate">{p.product_name}</p>
                      <p className="text-[10px] text-fg-3 truncate">{p.channel_name}</p>
                    </div>
                    <div className="text-right shrink-0 max-w-[11rem]">
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${inCycle ? 'text-accent' : 'text-fg-3'}`}>
                        {inCycle ? 'Neste ciclo' : 'Depois'}
                      </p>
                      <p className="text-[10px] text-fg leading-tight mt-0.5">{previewQueueLabel(p)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="sticky top-0 z-[1] flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-surface-2 border-y border-border text-xs mt-0">
            <span className="font-semibold text-fg">Últimos disparos criados pelo auto-match</span>
            <a href="/logs" className="text-[10px] text-accent hover:underline font-normal">
              Logs completos →
            </a>
          </div>
          {logsSorted.length === 0 ? (
            <p className="px-4 py-5 text-sm text-fg-3 text-center">Nenhum registro recente — quando o ciclo gerar dispatch, aparece aqui.</p>
          ) : (
            <div>
              {logsSorted.length > TIMELINE_LOG_CAP && (
                <p className="px-4 py-2 text-[11px] text-fg-3 bg-surface-2/30 border-b border-border/60">
                  Mostrando os {TIMELINE_LOG_CAP} mais recentes de {logsSorted.length} registros —{' '}
                  <a href="/logs?tab=dispatches" className="text-accent hover:underline">
                    ver todos nos logs
                  </a>
                  .
                </p>
              )}
              {logsSorted.slice(0, TIMELINE_LOG_CAP).map(renderLogRow)}
            </div>
          )}
        </div>

        {/* Aprovação manual (só quando Full-auto off) */}
        {!fullAutoMode && (
          <>
            <div className="px-4 py-2 border-t border-border bg-warning/5">
              <p className="text-xs font-medium text-fg">Aguardando seu OK</p>
              <p className="text-[10px] text-fg-3 mt-0.5">Dispatches em pending_approval não entram na fila até você aprovar (ou ligar Full-auto).</p>
            </div>
            {pendingLoading ? (
              <p className="px-4 py-6 text-sm text-fg-3">Carregando…</p>
            ) : pendingList.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-3 text-center">Nenhum dispatch aguardando aprovação.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border">
                      <th className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.size === pendingList.length && pendingList.length > 0}
                          onChange={toggleAll}
                          className="accent-accent"
                        />
                      </th>
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-fg-2 uppercase tracking-wide">Produto</th>
                      <SortHeader k="channel" label="Canal" />
                      <SortHeader k="source" label="Loja" />
                      <SortHeader k="price" label="Preço" align="text-right" />
                      <SortHeader k="score" label="Score" align="text-center" />
                      <SortHeader k="created_at" label="Quando" align="text-right" />
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPending.map(d => {
                      const isSel = selected.has(d.id)
                      return (
                        <tr
                          key={d.id}
                          className={`border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer ${
                            isSel ? 'bg-accent/5' : ''
                          }`}
                          onClick={() => toggleSelect(d.id)}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleSelect(d.id)}
                              onClick={e => e.stopPropagation()}
                              className="accent-accent"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {d.product_image && (
                                <img
                                  src={d.product_image}
                                  alt=""
                                  className="w-10 h-10 object-cover rounded border border-border flex-shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs text-fg truncate max-w-[240px]" title={d.product_name ?? ''}>
                                  {d.product_name || `Dispatch #${d.id}`}
                                </p>
                                {d.brand && <p className="text-[10px] text-fg-3">{d.brand}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-fg-2">{d.channel_name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-fg-2">{d.source ? SOURCE_LABEL[d.source] ?? d.source : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-fg whitespace-nowrap">
                            {d.price && d.price > 0 ? `R$ ${d.price.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {d.score != null ? (
                              <span
                                className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                  d.score >= 70
                                    ? 'bg-success/10 text-success'
                                    : d.score >= 50
                                      ? 'bg-warning/10 text-warning'
                                      : 'bg-surface-2 text-fg-3'
                                }`}
                              >
                                {d.score.toFixed(0)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-fg-3 whitespace-nowrap">{relativeFromNow(d.created_at)}</td>
                          <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Rejeitar"
                              disabled={rejectMut.isPending}
                              onClick={() => {
                                if (confirm('Rejeitar este dispatch?')) rejectMut.mutate(d.id)
                              }}
                              className="text-xs px-2 py-1 rounded border border-danger/30 text-danger hover:bg-danger/10"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Aba Por Canal ────────────────────────────────────────────────────────────

export function TabChannels({ onOpenDrawer }: { onOpenDrawer: (row: ChannelRow) => void }) {
  const [etaTick, setEtaTick] = React.useState(0)
  React.useEffect(() => {
    const id = window.setInterval(() => setEtaTick((t) => t + 1), 10_000)
    return () => window.clearInterval(id)
  }, [])

  const { data: rows = [], isLoading } = useQuery<ChannelRow[]>({
    queryKey: ['automations'],
    queryFn: () => apiClient.get('/api/automations').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: amStatus } = useQuery<AutoMatchStatus>({
    queryKey: ['auto-match'],
    queryFn: () => apiClient.get('/api/auto-match').then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const { data: appCfg } = useQuery<{ full_auto_mode?: boolean }>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
    staleTime: 60_000,
  })
  const fullAuto = !!appCfg?.full_auto_mode

  // Preview global (mesma fonte que /api/automations/:id/preview por canal): candidatos ao match, não dispatches
  const { data: globalPreview } = useQuery<{ items: GlobalPreviewItem[] }>({
    queryKey: ['auto-match', 'preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data),
    staleTime: 60_000,
  })
  const channelsWithQueue = React.useMemo(() => {
    const s = new Set<number>()
    if (globalPreview?.items) {
      for (const item of globalPreview.items) {
        if (!item.already_sent) s.add(item.channel_id)
      }
    }
    return s
  }, [globalPreview])

  const globalNextEtaLabel = React.useMemo(() => {
    void etaTick
    const iv = amStatus?.interval_seconds ?? 60
    const nextMs = computeNextAutoMatchTickMs(amStatus?.last_run_at ?? null, iv)
    if (nextMs == null) return null as string | null
    const secs = Math.max(0, Math.round((nextMs - Date.now()) / 1000))
    return fmtEtaSeconds(secs)
  }, [amStatus?.last_run_at, amStatus?.interval_seconds, etaTick])

  if (isLoading) {
    return (
      <div className="p-6 space-y-2">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-sm text-fg-3">Nenhum canal cadastrado.</p>
      </div>
    )
  }

  return (
    <div className="px-6 pb-6">
      <div className="bg-surface border border-border rounded-md overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2/40 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-2 uppercase tracking-wide">Canal</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-2 uppercase tracking-wide">
                  Auto-match
                  <TooltipIcon
                    side="top"
                    content="Liga automação deste canal e o disparo automático por score (mesmo interruptor)."
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-2 uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">
                    Eventos
                    <TooltipIcon
                      side="top"
                      content="Alertas de produto (novo, queda de preço, menor preço). Independente do interruptor Auto-match à esquerda."
                    />
                  </span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-2 uppercase tracking-wide">Threshold</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-2 uppercase tracking-wide">Última run</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-fg-2 uppercase tracking-wide">Runs 24h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const a = row.automation
                return (
                  <tr
                    key={row.channel_id}
                    className="border-b border-border last:border-0 hover:bg-surface-2/50 cursor-pointer"
                    onClick={() => onOpenDrawer(row)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-fg">{row.channel_name}</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <MasterToggle row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a?.events_enabled ? 'success' : 'default'} size="sm">
                        {a?.events_enabled ? 'on' : 'off'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-2">
                      {a?.threshold != null ? a.threshold : <span className="text-fg-3 italic">default</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-3">
                      {a?.updated_at ? fmtDate(a.updated_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-2">
                      {a?.enabled ? (
                        channelsWithQueue.has(row.channel_id) ? (
                          <span
                            className="text-xs text-success"
                            title={
                              fullAuto
                                ? 'Prévia: há produto elegível para este canal no próximo ciclo de auto-match (não garante envio se Evolution/rate limit falharem).'
                                : 'Prévia elegível. Com Full-auto desligado, o dispatch criado fica em pending_approval — aprove na aba Visão geral ou ligue Full-auto para ir direto à fila de envio.'
                            }
                          >
                            candidatos ✓
                          </span>
                        ) : (
                          <span className="inline-flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1 text-xs text-warning font-medium"
                              title="Prévia sem elegíveis para este canal (cooldown, threshold ou filtros). Não é o mesmo que fila do Evolution."
                            >
                              ⚠ sem candidatos
                            </span>
                            {globalNextEtaLabel != null && (
                              <span
                                className="text-[10px] text-fg-3"
                                title="Baseado no último tick global do worker e em interval_seconds da API — não usa a coluna Última run desta linha."
                              >
                                próx. ciclo global: {globalNextEtaLabel}
                              </span>
                            )}
                          </span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Pagina principal ─────────────────────────────────────────────────────────


export default function Automations() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <TabOverview />
      </div>
    </div>
  )
}
