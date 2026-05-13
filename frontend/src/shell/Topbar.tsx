import { useRef, useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import {
  statusChipSuccess,
  statusChipDanger,
  statusChipMuted,
  normalizeStatus,
} from '../lib/uiTokens'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { resolveTutorialSlugFromPath } from '../content/tutorials'

// ─── types ───────────────────────────────────────────────────────────────────

interface SenderAccount {
  id: number
  phone: string
  modem_id: number
  modem_slug: string
  status: string
  daily_send_quota: number
  last_sent_at: string | null
  consecutive_failures: number
  sent_today: number
}

interface JobActivityRow {
  at: string
  message: string
}

interface WorkQueueJobRow {
  kind: 'job'
  queue_ts: string
  id: string
  job_kind: string
  name: string
  status: string
  started_at: string
  completed_at?: string
  progress: number
  total?: number
  done?: number
  message?: string
  error?: string
  activity?: JobActivityRow[]
}

interface WorkQueueJonfreyRow {
  kind: 'jonfrey_audit'
  queue_ts: string
  id: number
  action_type: string
  status: string
  triggered_by: string
  created_at: string
  reasoning?: string | null
  error_message?: string | null
  target?: string
  finished_at?: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

type WorkQueueItem = WorkQueueJobRow | WorkQueueJonfreyRow

interface WorkQueuePayload {
  items: WorkQueueItem[]
  stats?: {
    job_stale_reconciled?: number
    jonfrey_stale_reconciled?: number
    generated_at?: string
  }
}

interface WorkQueueClearResponse {
  cleared_jobs?: number
  cleared_jonfrey?: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isJobRow(item: WorkQueueItem): item is WorkQueueJobRow {
  return item.kind === 'job'
}

function isQueueItemRunning(item: WorkQueueItem): boolean {
  return item.status === 'running'
}

function hasTerminalQueueItem(items: WorkQueueItem[]): boolean {
  return items.some(i => !isQueueItemRunning(i))
}

function fmtShort(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ─── data hooks ──────────────────────────────────────────────────────────────

function useWorkQueue(enabled: boolean) {
  return useQuery({
    queryKey: ['work-queue'],
    queryFn: () =>
      apiClient.get<WorkQueuePayload>('/api/work-queue').then(r => r.data ?? { items: [] }),
    refetchInterval: enabled ? 2_500 : 8_000,
    retry: false,
  })
}

function useAccountsStatus() {
  return useQuery({
    queryKey: ['accounts-stats'],
    queryFn: async () => {
      const res = await apiClient.get<SenderAccount[]>('/api/admin/senders/accounts')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => [])
      const active = res.filter(a => a.status !== 'banned')
      const connected = res.filter(a => a.status === 'primary').length
      return { connected, total: active.length }
    },
    staleTime: 8_000,
    refetchInterval: 10_000,
    retry: false,
  })
}

function useFullAutoMode() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
    refetchInterval: 30_000,
  })
}

// ─── StatusZone ──────────────────────────────────────────────────────────────
//
// Replaces the previous single-pill StatusPill. Key differences:
//
//   • Errors and Running counts get DEDICATED pills — they no longer compete by
//     priority (a single failure used to hide N running jobs behind it).
//   • Clicking either pill opens the SAME work-queue panel, but pre-selects a
//     filter (failed | running | all) so the user lands on the items that
//     triggered the badge instead of being redirected to an unrelated tab
//     (the old code sent failures to /activity?tab=crawl&status=error, which
//     reads from a different table — see commit history).
//   • Account-disconnect and full-auto stay as their own muted pills.
//   • An OK pill renders only when nothing else has signal.
//
// The panel is the existing universal queue UI (jobs + Jonfrey audit) with two
// additions: filter tabs at the top and a tiny empty-state per filter.

type QueueFilter = 'all' | 'running' | 'failed'

interface WorkQueuePanelProps {
  open: boolean
  filter: QueueFilter
  setFilter: (f: QueueFilter) => void
  data: WorkQueuePayload | undefined
  refetch: () => void
}

function WorkQueuePanel({ open, filter, setFilter, data, refetch }: WorkQueuePanelProps) {
  const qc = useQueryClient()
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const stats = data?.stats

  const sortedItems = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const ar = isQueueItemRunning(a) ? 0 : 1
      const br = isQueueItemRunning(b) ? 0 : 1
      if (ar !== br) return ar - br
      const ta = new Date(a.queue_ts).getTime()
      const tb = new Date(b.queue_ts).getTime()
      return ta - tb
    })
    return copy
  }, [items])

  const visibleItems = useMemo(() => {
    if (filter === 'running') return sortedItems.filter(isQueueItemRunning)
    if (filter === 'failed') return sortedItems.filter(i => i.status === 'failed')
    return sortedItems
  }, [sortedItems, filter])

  const runningJobRows = items.filter(isJobRow).filter(j => j.status === 'running')
  const totalRunning = items.filter(isQueueItemRunning).length
  const totalFailed = items.filter(i => i.status === 'failed').length

  const cancelOne = (id: string) => {
    apiClient.post(`/api/jobs/${id}/cancel`).then(() => {
      refetch()
      qc.invalidateQueries({ queryKey: ['jobs'] })
    })
  }
  const cancelAll = () => {
    if (confirm('Cancelar todos os jobs em execução na fila?')) {
      apiClient.post('/api/jobs/cancel-all').then(() => {
        refetch()
        qc.invalidateQueries({ queryKey: ['jobs'] })
      })
    }
  }
  const clearTerminalHistory = () => {
    if (
      !confirm(
        'Remover do histórico desta lista:\n• jobs finalizados (OK, falha, cancelado) na tabela background_jobs;\n• auditorias Jonfrey já concluídas (sucesso, falha, skipped).\n\nLinhas ainda em execução (running) não são apagadas.',
      )
    ) {
      return
    }
    apiClient.post<WorkQueueClearResponse>('/api/work-queue/clear').then(() => {
      refetch()
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-actions-recent'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-actions'] })
    })
  }

  const staleHint =
    (stats?.job_stale_reconciled ?? 0) > 0 || (stats?.jonfrey_stale_reconciled ?? 0) > 0
      ? `Auto-correção: ${stats?.job_stale_reconciled ?? 0} job(s) · ${stats?.jonfrey_stale_reconciled ?? 0} auditoria(s) marcados como falha (running antigo).`
      : null

  if (!open) return null

  const tabBtn = (k: QueueFilter, label: string, badge: number) => (
    <button
      type="button"
      onClick={() => setFilter(k)}
      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
        filter === k
          ? 'bg-accent/10 text-accent'
          : 'text-fg-3 hover:text-fg hover:bg-surface-2'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="ml-1 tabular-nums text-[10px] opacity-70">{badge}</span>
      )}
    </button>
  )

  const emptyMsg =
    filter === 'failed'
      ? 'Sem falhas no momento.'
      : filter === 'running'
        ? 'Nada em execução agora.'
        : 'Nada na fila neste momento.'

  return (
    <div className="absolute right-0 top-full mt-1 w-[26rem] max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-lg shadow-modal z-50 overflow-hidden flex flex-col max-h-[min(28rem,70vh)]">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 flex-shrink-0">
        <div>
          <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Fila universal</p>
          <p className="text-[10px] text-fg-3 mt-0.5">FIFO · jobs persistidos + auditoria Jonfrey</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {runningJobRows.length > 0 && (
            <button type="button" onClick={cancelAll} className="text-xs text-danger hover:underline whitespace-nowrap">
              cancelar jobs
            </button>
          )}
          {hasTerminalQueueItem(items) && (
            <button
              type="button"
              onClick={clearTerminalHistory}
              className="text-xs text-fg-3 hover:text-fg whitespace-nowrap"
              title="Remove jobs finalizados (incluindo falhas) e auditorias Jonfrey concluídas"
            >
              limpar histórico
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-1 flex-shrink-0">
        {tabBtn('all', 'Tudo', items.length)}
        {tabBtn('running', 'Em execução', totalRunning)}
        {tabBtn('failed', 'Falhas', totalFailed)}
      </div>
      {staleHint && (
        <div className="px-3 py-1.5 bg-warning/5 border-b border-border text-[10px] text-warning leading-snug">{staleHint}</div>
      )}
      <div className="overflow-y-auto flex-1 min-h-0">
        {visibleItems.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-fg-3">{emptyMsg}</p>
        )}
        {visibleItems.map((item, idx) => {
          const key = isJobRow(item) ? `job:${item.id}` : `jf:${item.id}:${item.created_at}`
          // Mesmo helper para os dois tipos de linha — garante que "running"
          // job e "running" Jonfrey tenham EXATAMENTE a mesma cor/label.
          const s = normalizeStatus(item.status)
          if (isJobRow(item)) {
            const j = item
            const act = j.activity ?? []
            return (
              <div key={key} className="px-3 py-2 border-b border-border last:border-0 bg-surface">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg font-medium truncate" title={j.name}>
                    <span className="text-[10px] text-fg-3 font-mono mr-1.5">{j.job_kind}</span>
                    {j.name}
                  </span>
                  <span
                    className={`${s.chipClass} flex-shrink-0 !px-1.5 !py-0.5 !text-[10px] !rounded`}
                    title={`status: ${j.status}`}
                  >
                    {s.pulseDot && (
                      <span className={`w-1 h-1 rounded-full ${s.dotColorClass} animate-pulse shrink-0`} aria-hidden />
                    )}
                    {s.label}
                  </span>
                </div>
                <p className="text-[10px] text-fg-3 mt-0.5 font-mono">{fmtShort(j.queue_ts)} · #{idx + 1}</p>
                {s.tone === 'running' && (
                  <>
                    <div className="mt-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all" style={{ width: `${j.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-fg-3">
                        {j.done ?? 0}/{j.total ?? '?'} · {j.progress}%
                      </span>
                      <button type="button" onClick={() => cancelOne(j.id)} className="text-xs text-danger hover:underline">
                        cancelar
                      </button>
                    </div>
                  </>
                )}
                {j.message && <p className="text-xs text-fg-3 mt-0.5 truncate" title={j.message}>{j.message}</p>}
                {j.error && <p className="text-xs text-danger mt-0.5 break-all">{j.error}</p>}
                {act.length > 0 && (
                  <details className="mt-1.5 rounded border border-border bg-surface-2">
                    <summary className="cursor-pointer px-2 py-1 text-[10px] text-fg-3 uppercase tracking-wide select-none">
                      Actividade ({act.length})
                    </summary>
                    <ul className="max-h-36 overflow-y-auto px-2 pb-2 space-y-0.5 font-mono text-[10px] text-fg-2">
                      {act.map((line, i) => (
                        <li key={i} className="border-l border-border pl-2">
                          <span className="text-fg-3">{fmtShort(line.at)}</span> {line.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )
          }
          const a = item
          const err = a.error_message?.trim()
          const sum = err || a.reasoning?.trim() || (s.tone === 'running' ? 'Em execução…' : '—')
          return (
            <div key={key} className="px-3 py-2 border-b border-border last:border-0 bg-surface-2/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-fg truncate">{a.action_type}</span>
                <span
                  className={`${s.chipClass} flex-shrink-0 !px-1.5 !py-0.5 !text-[10px] !rounded`}
                  title={`status: ${a.status}`}
                >
                  {s.pulseDot && (
                    <span className={`w-1 h-1 rounded-full ${s.dotColorClass} animate-pulse shrink-0`} aria-hidden />
                  )}
                  {s.label}
                </span>
              </div>
              <p className="text-[10px] text-fg-3 mt-0.5">
                {fmtShort(a.queue_ts)} · {a.triggered_by}
                {a.target ? ` · ${a.target}` : ''}
              </p>
              <p className="text-xs text-fg-2 mt-1 leading-snug line-clamp-3" title={sum}>
                {sum}
              </p>
            </div>
          )
        })}
      </div>
      {stats?.generated_at && (
        <div className="px-3 py-1.5 border-t border-border text-[9px] text-fg-3 font-mono flex-shrink-0">
          sync {fmtShort(stats.generated_at)}
        </div>
      )}
    </div>
  )
}

export function StatusZone() {
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(false)
  const [filter, setFilter] = useState<QueueFilter>('all')
  const ref = useRef<HTMLDivElement>(null)

  const { data: wqData, refetch: refetchWQ } = useWorkQueue(panelOpen)
  const { data: accountsData } = useAccountsStatus()
  const { data: configData } = useFullAutoMode()

  const items = useMemo(() => wqData?.items ?? [], [wqData?.items])
  const runningCount = useMemo(() => items.filter(isQueueItemRunning).length, [items])
  const failedCount = useMemo(() => items.filter(i => i.status === 'failed').length, [items])
  const queuedOnlyCount = items.length - runningCount - failedCount

  const accountsConnected = accountsData?.connected ?? null
  const accountsTotal = accountsData?.total ?? 0
  const hasAccountError =
    accountsConnected !== null && accountsTotal > 0 && accountsConnected === 0
  const fullAutoMode = !!(configData as { full_auto_mode?: boolean } | undefined)?.full_auto_mode

  const openPanel = (f: QueueFilter) => {
    setFilter(f)
    setPanelOpen(true)
  }
  const togglePanel = (f: QueueFilter) => {
    if (panelOpen && filter === f) {
      setPanelOpen(false)
      return
    }
    openPanel(f)
  }

  // Close panel on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setPanelOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const hasAnySignal =
    failedCount > 0 ||
    runningCount > 0 ||
    queuedOnlyCount > 0 ||
    hasAccountError ||
    fullAutoMode

  return (
    <div ref={ref} className="relative flex items-center gap-1.5 flex-shrink-0">
      {/*
        Pills externas usam exatamente a MESMA família de cores que os itens
        dentro do popup — antes havia conflito (running âmbar fora, roxo
        dentro). Cores vêm de normalizeStatus() para manter sincronia.
      */}
      {failedCount > 0 && (() => {
        const s = normalizeStatus('failed')
        return (
          <button
            type="button"
            onClick={() => togglePanel('failed')}
            title={`${failedCount} item(s) com falha · clique para ver detalhes`}
            aria-label={`${failedCount} falhas na fila`}
            className={`${s.chipClass} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
          >
            <span aria-hidden>{s.icon}</span>
            <span className="tabular-nums">
              {failedCount} {failedCount === 1 ? 'falha' : 'falhas'}
            </span>
          </button>
        )
      })()}

      {runningCount > 0 && (() => {
        const s = normalizeStatus('running')
        return (
          <button
            type="button"
            onClick={() => togglePanel('running')}
            title={`${runningCount} item(s) em execução · clique para acompanhar`}
            aria-label={`${runningCount} itens em execução`}
            className={`${s.chipClass} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
          >
            <span aria-hidden>{s.icon}</span>
            <span className="tabular-nums">
              {runningCount} em execução
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${s.dotColorClass} animate-pulse shrink-0`}
              aria-hidden
            />
          </button>
        )
      })()}

      {queuedOnlyCount > 0 && failedCount === 0 && runningCount === 0 && (() => {
        const s = normalizeStatus('pending')
        return (
          <button
            type="button"
            onClick={() => togglePanel('all')}
            title={`${queuedOnlyCount} item(s) aguardando na fila`}
            aria-label={`${queuedOnlyCount} itens aguardando`}
            className={`${s.chipClass} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
          >
            <span aria-hidden>{s.icon}</span>
            <span className="tabular-nums">{queuedOnlyCount} aguardando</span>
          </button>
        )
      })()}

      {hasAccountError && (
        <button
          type="button"
          onClick={() => navigate('/accounts')}
          title={`0 de ${accountsTotal} contas conectadas`}
          aria-label="Contas desconectadas — abrir página de contas"
          className={`${statusChipDanger} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
        >
          <span aria-hidden>⚠</span>
          <span>Contas</span>
        </button>
      )}

      {fullAutoMode && failedCount === 0 && runningCount === 0 && queuedOnlyCount === 0 && !hasAccountError && (
        <button
          type="button"
          onClick={() => navigate('/automations/jonfrey')}
          title="Full-auto ativo — clique para ver Jonfrey"
          aria-label="Full-auto ativo"
          className={`${statusChipMuted} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
        >
          <span aria-hidden>🤖</span>
          <span>Auto</span>
        </button>
      )}

      {!hasAnySignal && (
        <button
          type="button"
          onClick={() => navigate('/activity')}
          title="Tudo OK — clique para ver atividades"
          aria-label="Status do sistema: OK"
          className={`${statusChipSuccess} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
        >
          <span aria-hidden>✓</span>
          <span>OK</span>
        </button>
      )}

      <WorkQueuePanel
        open={panelOpen}
        filter={filter}
        setFilter={setFilter}
        data={wqData}
        refetch={refetchWQ}
      />
    </div>
  )
}

// ─── HelpManualButton ────────────────────────────────────────────────────────

function HelpManualButton() {
  const navigate = useNavigate()
  const location = useLocation()

  function handleClick() {
    const slug = resolveTutorialSlugFromPath(location.pathname)
    navigate(`/manual/${slug}`)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Abrir manual"
      title="Manual desta página"
      className="rounded-md p-1.5 text-fg-3 hover:text-fg hover:bg-surface-2 transition-colors font-semibold leading-none text-sm"
    >
      ?
    </button>
  )
}

// ─── Topbar ──────────────────────────────────────────────────────────────────

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center min-h-14 h-14 px-3 sm:px-4 bg-bg/95 backdrop-blur border-b border-border flex-shrink-0 gap-2 sm:gap-3">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden text-fg-2 hover:text-fg min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded shrink-0"
        aria-label="Abrir menu"
      >
        ☰
      </button>

      {/* Search */}
      <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
        <SearchBar />
      </div>

      {/* Status zone — separate pills for errors / running / queue / accounts / auto */}
      <StatusZone />

      {/* Help manual button */}
      <HelpManualButton />

      {/* Theme toggle — always rightmost */}
      <ThemeToggle />
    </header>
  )
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: results = [] } = useQuery<any[]>({
    queryKey: ['catalog-search', query],
    queryFn: () => query.trim().length >= 2
      ? apiClient.get(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=8`).then(r => r.data ?? [])
      : Promise.resolve([]),
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const showDropdown = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className="flex-1 max-w-md relative flex items-center min-w-0">
      <span className="absolute left-2.5 text-fg-2 pointer-events-none text-sm leading-none">🔍</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar…"
        title="Buscar produtos, grupos, canais (⌘K)"
        className="w-full h-8 pl-8 pr-8 md:pr-14 rounded-md bg-surface-2 border border-border text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
      />
      <kbd className="absolute right-2 hidden md:flex items-center gap-0.5 text-[10px] text-fg-3 bg-surface border border-border rounded px-1 py-0.5 pointer-events-none font-mono leading-none">
        ⌘K
      </kbd>

      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-modal z-50 overflow-hidden">
          <p className="px-3 py-1.5 text-xs text-fg-3 border-b border-border">Produtos do catálogo</p>
          {results.map((p: any) => {
            const name = p.canonical_name ?? ''
            const price = p.lowest_price ?? p.lowest_price?.Float64 ?? 0
            const img = typeof p.image_url === 'string' ? p.image_url : p.image_url?.String ?? ''
            return (
              <button
                key={p.id}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-left"
                onClick={() => {
                  navigate(`/compose?productIds=${p.id}`)
                  setQuery('')
                  setOpen(false)
                }}
              >
                {img ? (
                  <img src={img} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="w-8 h-8 rounded bg-surface-2 flex items-center justify-center flex-shrink-0 text-sm">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{name}</p>
                  {price > 0 && <p className="text-xs text-success">R$ {Number(price).toFixed(2)}</p>}
                </div>
                <span className="text-xs text-accent flex-shrink-0">compor →</span>
              </button>
            )
          })}
          <button
            type="button"
            className="w-full px-3 py-2 text-xs text-fg-3 hover:bg-surface-2 border-t border-border text-center"
            onClick={() => { navigate(`/catalog?q=${encodeURIComponent(query)}`); setOpen(false) }}
          >
            Ver todos os resultados no catálogo →
          </button>
        </div>
      )}
    </div>
  )
}
