import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { dispatchOriginLabel } from '../lib/dispatchOrigin'
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
  max_groups_per_dispatch?: number | null
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
  /** dispatches.composed_by — manual, auto-match, api, … */
  composed_by?: string
}

interface GlobalPreviewItem {
  product_id: number
  channel_id: number
  product_name: string
  channel_name: string
  score: number
  already_sent: boolean
  /** Prévia alinhada ao worker (GET /api/auto-match/preview) */
  dispatch_rank?: number
  max_per_run?: number
  in_this_cycle?: boolean
}

interface AutoMatchStatus {
  enabled: boolean
  threshold: number
  max_per_run: number
  logs: AutoMatchLog[]
  /** Dispatches com composed_by=auto-match nas últimas 24h (servidor); preferir ao contar só linhas em logs */
  dispatch_count_24h?: number
  last_run_at: string | null
  interval_seconds: number
  curation_script_confidence_min?: number
  curation_llm_confidence_threshold?: number
  curation_heuristic_interval_seconds?: number
  curation_heuristic_batch_size?: number
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
    max_groups_per_dispatch: 1,
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
        <ChannelDetailInner channelId={String(row.channel_id)} embedded onClose={onClose} editAutomation />
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

  const { data: appConfig } = useQuery<{ full_auto_mode?: boolean; dispatch_min_interval_ms?: number } & Record<string, unknown>>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
    staleTime: 60_000,
  })
  const fullAutoMode = !!appConfig?.full_auto_mode

  const [localDispatchMinMs, setLocalDispatchMinMs] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!appConfig || localDispatchMinMs !== null) return
    const v = (appConfig as { dispatch_min_interval_ms?: number }).dispatch_min_interval_ms
    setLocalDispatchMinMs(typeof v === 'number' && !Number.isNaN(v) ? v : 0)
  }, [appConfig, localDispatchMinMs])

  const saveDispatchIntervalMut = useMutation({
    mutationFn: async (ms: number) => {
      await apiClient.put('/api/config', { dispatch_min_interval_ms: Math.max(0, Math.floor(ms)) })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar pausa Evolution'),
  })

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
    mutationFn: async (payload: Partial<{
      enabled: boolean
      threshold: number
      max_per_run: number
      interval_seconds: number
      curation_script_confidence_min: number
      curation_llm_confidence_threshold: number
      curation_heuristic_interval_seconds: number
      curation_heuristic_batch_size: number
    }>) => {
      const r = await apiClient.post('/api/auto-match/toggle', payload)
      if (payload.enabled !== undefined) {
        try {
          await apiClient.put('/api/jonfrey/config', { enabled: payload.enabled })
        } catch (err: any) {
          const msg = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
          alert(
            `Auto-match foi salvo, mas o Jonfrey não sincronizou (${msg}). O interruptor mostra o auto-match; ligue o Jonfrey em Configurações ou tente de novo.`,
          )
        }
      }
      return r.data
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
    worker_aligned?: boolean
  }>({
    queryKey: ['auto-match', 'preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data).catch(() => ({ items: [] })),
    refetchInterval: 60_000,
  })

  const previewCandidates = React.useMemo(() => {
    const raw = nextCyclePreview?.items ?? []
    return raw.filter((i) => !i.already_sent)
  }, [nextCyclePreview])

  const [localThreshold, setLocalThreshold] = React.useState<number | null>(null)
  const [localMaxPerRun, setLocalMaxPerRun] = React.useState<number | null>(null)
  const [localIntervalSec, setLocalIntervalSec] = React.useState<number | null>(null)
  const [localScriptMin, setLocalScriptMin] = React.useState<number | null>(null)
  const [localLLMThresh, setLocalLLMThresh] = React.useState<number | null>(null)
  const [localHeurInt, setLocalHeurInt] = React.useState<number | null>(null)
  const [localHeurBatch, setLocalHeurBatch] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (data) {
      if (localThreshold === null) setLocalThreshold(data.threshold)
      if (localMaxPerRun === null) setLocalMaxPerRun(data.max_per_run)
      if (localIntervalSec === null) setLocalIntervalSec(data.interval_seconds)
      if (localScriptMin === null) setLocalScriptMin(data.curation_script_confidence_min ?? 0.75)
      if (localLLMThresh === null) setLocalLLMThresh(data.curation_llm_confidence_threshold ?? 0.65)
      if (localHeurInt === null) setLocalHeurInt(data.curation_heuristic_interval_seconds ?? 120)
      if (localHeurBatch === null) setLocalHeurBatch(data.curation_heuristic_batch_size ?? 500)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = data?.enabled ?? false
  const threshold = localThreshold ?? data?.threshold ?? 50
  const maxPerRunCfg = localMaxPerRun ?? data?.max_per_run ?? 3
  const intervalSecLocal = localIntervalSec ?? data?.interval_seconds ?? 60
  const scriptMinLocal = localScriptMin ?? data?.curation_script_confidence_min ?? 0.75
  const llmThreshLocal = localLLMThresh ?? data?.curation_llm_confidence_threshold ?? 0.65
  const heurIntLocal = localHeurInt ?? data?.curation_heuristic_interval_seconds ?? 120
  const heurBatchLocal = localHeurBatch ?? data?.curation_heuristic_batch_size ?? 500
  const logs = data?.logs ?? []

  const now = Date.now()
  const h24ago = now - 24 * 3600 * 1000
  /** KPI alinhado à tabela dispatches (evita 0 quando auto_match_logs falhou ou divergiu). */
  const dispatches24h =
    typeof data?.dispatch_count_24h === 'number'
      ? data.dispatch_count_24h
      : logs.filter(l => new Date(l.created_at).getTime() > h24ago).length

  /** Jonfrey (curadoria / fila) — precisa estar on para o “pipeline” completo. */
  const jonfreyOn = jonfreyConfig?.enabled ?? false
  /** Match + Jonfrey ok — usado para aprovações / estado “operacional”. */
  const pipelineReady = enabled && jonfreyOn

  const nextAutoMatchMs = React.useMemo(
    () =>
      intervalSecLocal > 0 ? computeNextAutoMatchTickMs(data?.last_run_at ?? null, intervalSecLocal) : null,
    [data?.last_run_at, intervalSecLocal],
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
  const intervalSecAm = intervalSecLocal

  const workerPreview = nextCyclePreview?.worker_aligned === true

  const previewRankInChannel = React.useMemo(() => {
    if (workerPreview) return new Map<string, number>()
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
  }, [previewCandidates, workerPreview])

  const previewQueueLabel = (p: GlobalPreviewItem): string => {
    if (!enabled) return '—'
    if (workerPreview && p.dispatch_rank != null) {
      const mpr = p.max_per_run ?? maxPerRunEffective
      return `${p.dispatch_rank}º no canal · máx ${mpr}/ciclo`
    }
    const rank = previewRankInChannel.get(`${p.channel_id}-${p.product_id}`) ?? 1
    return `${rank}º no canal · máx ${maxPerRunEffective}/ciclo`
  }

  const isInThisAutoMatchCycle = React.useCallback(
    (p: GlobalPreviewItem): boolean => {
      if (!enabled) return false
      if (workerPreview && p.in_this_cycle !== undefined) return p.in_this_cycle
      const rank = previewRankInChannel.get(`${p.channel_id}-${p.product_id}`) ?? 999
      return rank <= maxPerRunEffective
    },
    [enabled, previewRankInChannel, maxPerRunEffective, workerPreview],
  )

  /** Com worker_aligned, a API já devolve a ordem global do próximo ciclo. */
  const previewRowsSorted = React.useMemo(() => {
    const arr = [...previewCandidates]
    if (workerPreview) {
      return arr
    }
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
  }, [previewCandidates, previewRankInChannel, isInThisAutoMatchCycle, workerPreview])

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

  const flipPilotMaster = React.useCallback(async () => {
    const next = !enabled
    await toggleMut.mutateAsync({ enabled: next })
    if (next) await toggleFullAuto.mutateAsync(true)
  }, [enabled, toggleMut, toggleFullAuto])

  const renderLogRow = (log: AutoMatchLog) => {
    const groups = log.group_names ? log.group_names.split(', ').filter(Boolean) : []
    const groupsTitle = groups.length > 0 ? groups.join(', ') : undefined
    const scoreLabel = log.score < 0 ? '—' : fmtScore(log.score)
    const scoreClass =
      log.score < 0
        ? 'bg-surface-2 text-fg-3'
        : log.score >= 70
          ? 'bg-success/10 text-success'
          : log.score >= 50
            ? 'bg-warning/10 text-warning'
            : 'bg-surface-2 text-fg-3'
    const originRaw = (log.composed_by ?? '').trim()
    const showOriginTag = originRaw !== '' && originRaw !== 'auto-match'
    return (
      <a
        key={`${log.id}-${log.dispatch_id}`}
        href={`/logs?dispatchId=${log.dispatch_id}`}
        className="px-3 py-2 flex items-center gap-3 border-b border-border/80 last:border-0 hover:bg-surface-2/40 transition-colors no-underline text-inherit cursor-pointer"
      >
        <span title={log.score < 0 ? 'Dispatch sem linha em auto_match_logs (score indisponível)' : undefined} className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${scoreClass}`}>
          {scoreLabel}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-fg truncate" title={groupsTitle}>
            {log.product_name || `Produto #${log.product_id}`}
          </p>
          <p className="text-[10px] text-fg-3 truncate">{log.channel_name ?? '—'}</p>
          {showOriginTag && (
            <p className="text-[10px] text-fg-3 mt-0.5">
              <span className="inline-block rounded px-1 py-0.5 bg-surface-2 border border-border/60 text-fg-2">
                {dispatchOriginLabel(log.composed_by)}
              </span>
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-medium text-success">Enviado</p>
          <p className="text-[10px] text-fg-3 whitespace-nowrap">{relativeFromNow(log.created_at)}</p>
        </div>
      </a>
    )
  }

  return (
    <div className="px-4 py-4 sm:p-6 space-y-5">
      <h1 className="text-xl font-semibold text-fg">Automações</h1>
      <FullAutoStatusBanner
        placement="automations"
        trailing={
          <div className="flex flex-col items-end gap-2">
            <div
              className={`rounded-md border p-3 shadow-card transition-colors min-w-[14rem] ${
                !enabled
                  ? 'border-border bg-surface'
                  : !pipelineReady
                    ? 'border-warning/40 bg-surface'
                    : fullAutoMode
                      ? 'border-success/40 bg-surface'
                      : 'border-warning/40 bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-right">
                  <p className="text-[10px] text-fg-3 font-medium uppercase tracking-wide">Auto-pilot</p>
                  <p
                    className={`text-xs font-semibold mt-0.5 leading-snug ${
                      !enabled
                        ? 'text-fg-2'
                        : !pipelineReady
                          ? 'text-warning'
                          : fullAutoMode
                            ? 'text-success'
                            : 'text-warning'
                    }`}
                  >
                    {!enabled
                      ? 'Pausado'
                      : !pipelineReady
                        ? 'Match ligado · Jonfrey pausado'
                        : fullAutoMode
                          ? 'Ativo · enviando'
                          : 'Ativo · aguardando aprovação'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={toggleMut.isPending || toggleFullAuto.isPending}
                  onClick={() => flipPilotMaster()}
                  aria-label={
                    !enabled
                      ? 'Auto-pilot pausado'
                      : !pipelineReady
                        ? 'Auto-match ligado — Jonfrey pausado'
                        : fullAutoMode
                          ? 'Auto-pilot ativo — enviando'
                          : 'Auto-pilot ativo — aguardando aprovação'
                  }
                  title="Liga/desliga o master do auto-match (GET /api/auto-match enabled). Tenta sincronizar o Jonfrey no mesmo clique."
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${enabled ? 'bg-accent' : 'bg-border'} disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              {pipelineReady && (pendingCount ?? 0) > 0 && !fullAutoMode && (
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
        trailingCompact={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={toggleMut.isPending || toggleFullAuto.isPending}
              onClick={() => flipPilotMaster()}
              aria-label={
                !enabled
                  ? 'Auto-pilot pausado'
                  : !pipelineReady
                    ? 'Auto-match ligado — Jonfrey pausado'
                    : fullAutoMode
                      ? 'Auto-pilot ativo'
                      : 'Auto-pilot — aguardando aprovação'
              }
              title="Auto-pilot (master auto-match; sincroniza Jonfrey quando possível)"
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-accent' : 'bg-border'} disabled:opacity-50`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
            {pipelineReady && (pendingCount ?? 0) > 0 && !fullAutoMode && (
              <button
                type="button"
                disabled={approveAllMut.isPending}
                onClick={() => approveAllMut.mutate()}
                title={approveAllMut.isPending ? 'Enviando…' : `Enviar ${pendingCount} dispatches pendentes`}
                aria-label={approveAllMut.isPending ? 'Enviando pendentes' : `Enviar ${pendingCount} pendentes`}
                className="min-h-[2rem] min-w-[2rem] rounded-full bg-accent text-white text-xs font-semibold px-2 py-1 hover:bg-accent/90 disabled:opacity-50 shadow-sm"
              >
                {approveAllMut.isPending ? '…' : pendingCount > 99 ? '99+' : pendingCount}
              </button>
            )}
          </div>
        }
      />

      {!fullAutoMode && pendingList.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
            variant="ghost"
            size="sm"
            loading={approveAllMut.isPending}
            onClick={() => {
              if (confirm(`Aprovar TODOS os ${pendingList.length} pendentes?`)) approveAllMut.mutate()
            }}
          >
            Todos · aprovar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={rejectBatchMut.isPending}
            onClick={() => {
              if (confirm(`Rejeitar TODOS os ${pendingList.length} pendentes?`)) rejectBatchMut.mutate(pendingList.map(i => i.id))
            }}
          >
            Todos · rejeitar
          </Button>
        </div>
      ) : null}

      {/* ── KPI + thresholds ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full max-w-6xl">

        {/* Disparos 24h */}
        <KpiCard label="Dispatches 24h" value={dispatches24h}
          tooltip="Dispatches criados pelo worker (auto-match) nas últimas 24h, excluindo rascunho. A timeline abaixo inclui qualquer origem na mesma janela." />

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
              <TooltipIcon content="Não é limite por dia. É o máximo de produtos (dispatches automáticos criados) por canal por execução do worker de auto-match. Cada canal tem esse teto independentemente." side="top" />
            </div>
            <input type="number" min={1} max={20} value={maxPerRunCfg}
              onChange={e => setLocalMaxPerRun(Number(e.target.value))}
              onBlur={() => toggleMut.mutate({ max_per_run: maxPerRunCfg })}
              className="w-full text-sm font-bold border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">Tick auto-match (s)</p>
              <TooltipIcon content="Intervalo mínimo entre ciclos do worker de auto-match (15–3600 s). O servidor consulta a cada ~15 s; só corre o ciclo após este período desde o último tick registrado." side="top" />
            </div>
            <input type="number" min={15} max={3600} step={1} value={intervalSecLocal}
              onChange={e => setLocalIntervalSec(Number(e.target.value))}
              onBlur={() => toggleMut.mutate({ interval_seconds: intervalSecLocal })}
              className="w-full text-sm font-bold border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">Pausa Evolution (ms)</p>
              <TooltipIcon content="Intervalo mínimo entre processar dois targets consecutivos no worker de disparos (Evolution). 0 = sem pausa extra (continua valendo limite 3/h por grupo)." side="top" />
            </div>
            <input
              type="number"
              min={0}
              max={600_000}
              step={50}
              value={localDispatchMinMs ?? 0}
              onChange={e => setLocalDispatchMinMs(Number(e.target.value))}
              onBlur={() => saveDispatchIntervalMut.mutate(localDispatchMinMs ?? 0)}
              disabled={saveDispatchIntervalMut.isPending || appConfig == null}
              className="w-full text-sm font-bold border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent disabled:opacity-50"
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-md p-4 shadow-card space-y-3 sm:col-span-2 xl:col-span-1">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">Curadoria por script (batch)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[10px] text-fg-3 uppercase tracking-wide">Conf. mínima script</p>
                <TooltipIcon content="Aplica marca/categoria automaticamente só quando keywords + patterns ≥ este valor (0–1)." side="top" />
              </div>
              <input type="number" min={0} max={1} step={0.05} value={scriptMinLocal}
                onChange={e => setLocalScriptMin(Number(e.target.value))}
                onBlur={() => toggleMut.mutate({ curation_script_confidence_min: scriptMinLocal })}
                className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[10px] text-fg-3 uppercase tracking-wide">Limiar LLM</p>
                <TooltipIcon content="Auto-LLM só processa produtos com confiança script abaixo deste valor (encaminha dúvidas ao modelo)." side="top" />
              </div>
              <input type="number" min={0} max={1} step={0.05} value={llmThreshLocal}
                onChange={e => setLocalLLMThresh(Number(e.target.value))}
                onBlur={() => toggleMut.mutate({ curation_llm_confidence_threshold: llmThreshLocal })}
                className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[10px] text-fg-3 uppercase tracking-wide">Intervalo worker script (s)</p>
                <TooltipIcon content="Mínimo entre execuções do worker que só aplica heurística (sem LLM). 30–86400 s." side="top" />
              </div>
              <input type="number" min={30} max={86400} step={10} value={heurIntLocal}
                onChange={e => setLocalHeurInt(Number(e.target.value))}
                onBlur={() => toggleMut.mutate({ curation_heuristic_interval_seconds: heurIntLocal })}
                className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[10px] text-fg-3 uppercase tracking-wide">Tamanho do batch</p>
                <TooltipIcon content="Produtos por rodada do worker de curadoria por script (50–2000)." side="top" />
              </div>
              <input type="number" min={50} max={2000} step={50} value={heurBatchLocal}
                onChange={e => setLocalHeurBatch(Number(e.target.value))}
                onBlur={() => toggleMut.mutate({ curation_heuristic_batch_size: heurBatchLocal })}
                className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent" />
            </div>
          </div>
        </div>
      </div>

      {/* Linha do tempo: envio WA + próximos (prévia) + enviados */}
      <div className="bg-surface border border-border rounded-lg shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-2/40 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">Próxima janela · já disparado</p>
            <p className="text-[11px] text-fg-3 mt-1 max-w-3xl leading-relaxed">
              Ciclo de match vs Jonfrey; cooldown e aprovação podem impedir envio.
            </p>
          </div>
          <button
            type="button"
            title="Recarregar prévia e timeline"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['auto-match'] })
              qc.invalidateQueries({ queryKey: ['auto-match', 'preview'] })
              qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
            }}
            className="text-fg-3 hover:text-fg shrink-0 rounded-md border border-border/80 px-2 py-1 text-xs hover:bg-surface-2"
          >
            ↻
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

        <div className="px-4 py-2.5 border-b border-border bg-whatsapp/8 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-2 min-w-0">
            Worker de envio ~15s — use só se quiser desbloquear antes do próximo ciclo.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            loading={processQueueMut.isPending}
            onClick={() => processQueueMut.mutate()}
          >
            Processar fila
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
            <span className="font-semibold text-fg">Últimos disparos (24h)</span>
            <a href="/logs?tab=dispatches" className="text-[11px] text-accent hover:underline font-medium">
              Ver no Logs
            </a>
          </div>
          {logsSorted.length === 0 ? (
            <p className="px-4 py-5 text-sm text-fg-3 text-center">
              Nenhum disparo fora de rascunho nas últimas 24h. Se o KPI “Dispatches 24h” é maior que zero e esta lista continua vazia, o servidor provavelmente ainda não está com o backend que corrige a query da timeline — faça deploy e reinicie.
            </p>
          ) : (
            <div>
              {logsSorted.length > TIMELINE_LOG_CAP && (
                <p className="px-4 py-2 text-[11px] text-fg-3 bg-surface-2/30 border-b border-border/60">
                  Primeiros {TIMELINE_LOG_CAP} de {logsSorted.length} — o resto está na página Logs (link acima).
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
