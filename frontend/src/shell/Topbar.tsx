import { useRef, useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { pageTitleFromPath } from './pageTitleFromPath'
import {
  statusChipSuccess,
  statusChipWarning,
  statusChipDanger,
  statusChipMuted,
} from '../lib/uiTokens'
import { ThemeToggle } from '../components/ui/ThemeToggle'

// ─── types ───────────────────────────────────────────────────────────────────

interface WAAccount {
  id: number
  status: string
  active: boolean
}

interface TGAccount {
  id: number
  active: boolean
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
      const [waRes, tgRes] = await Promise.all([
        apiClient.get<WAAccount[]>('/api/accounts/wa').then(r => (Array.isArray(r.data) ? r.data : [])),
        apiClient.get<TGAccount[]>('/api/accounts/tg').then(r => (Array.isArray(r.data) ? r.data : [])),
      ])
      const total = waRes.length + tgRes.length
      const connected =
        waRes.filter(a => a.status === 'connected').length +
        tgRes.filter(a => a.active).length
      return { connected, total }
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

// ─── StatusPill ──────────────────────────────────────────────────────────────

/**
 * Single consolidated status chip for the Topbar.
 *
 * Priority (highest wins):
 *   1. danger  — accounts with 0 connected (none at all → data loaded + total>0 + connected=0)
 *                OR any job with status=failed
 *   2. warning — work queue has any items (running or pending)
 *   3. muted   — FullAutoMode active (auto-pilot on, nothing in queue)
 *   4. success — everything nominal
 *
 * Clicking opens the WorkQueue panel (which is the richest live-status panel available).
 * For error states the click navigates to /activity?level=error.
 * For queue items the click navigates to /activity?status=pending.
 * For FullAuto muted the click navigates to /automations/jonfrey.
 */
export function StatusPill() {
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: wqData, refetch: refetchWQ } = useWorkQueue(panelOpen)
  const { data: accountsData } = useAccountsStatus()
  const { data: configData } = useFullAutoMode()

  const items = wqData?.items ?? []
  const stats = wqData?.stats

  const activeRunningCount = useMemo(() => items.filter(isQueueItemRunning).length, [items])
  const failedCount = useMemo(
    () => items.filter(i => i.status === 'failed').length,
    [items],
  )

  const accountsConnected = accountsData?.connected ?? null
  const accountsTotal = accountsData?.total ?? 0
  const hasAccountError = accountsConnected !== null && accountsTotal > 0 && accountsConnected === 0
  const fullAutoMode = !!(configData as { full_auto_mode?: boolean } | undefined)?.full_auto_mode

  // Determine chip variant
  type Variant = 'danger' | 'warning' | 'muted' | 'success'
  const variant: Variant = (() => {
    if (hasAccountError || failedCount > 0) return 'danger'
    if (items.length > 0) return 'warning'
    if (fullAutoMode) return 'muted'
    return 'success'
  })()

  const chipClass: Record<Variant, string> = {
    danger: statusChipDanger,
    warning: statusChipWarning,
    muted: statusChipMuted,
    success: statusChipSuccess,
  }

  const chipLabel: Record<Variant, string> = {
    danger: failedCount > 0 ? `${failedCount} erro${failedCount !== 1 ? 's' : ''}` : 'Contas desconectadas',
    warning: activeRunningCount > 0
      ? `${activeRunningCount} ativo${activeRunningCount !== 1 ? 's' : ''}`
      : `${items.length} na fila`,
    muted: 'Auto',
    success: 'OK',
  }

  const chipIcon: Record<Variant, string> = {
    danger: '⚠',
    warning: '⏳',
    muted: '🤖',
    success: '✓',
  }

  const chipTitle: Record<Variant, string> = {
    danger: hasAccountError
      ? `0 de ${accountsTotal} contas conectadas${failedCount > 0 ? ` · ${failedCount} job(s) com falha` : ''}`
      : `${failedCount} job(s) com falha`,
    warning: `${items.length} item(s) na fila · ${activeRunningCount} em execução`,
    muted: 'Full-auto ativo — clique para ver Jonfrey',
    success: 'Tudo OK',
  }

  // Click handler: opens panel for queue states; navigates for others
  function handleClick() {
    if (variant === 'danger' && failedCount > 0) {
      navigate('/activity?level=error')
      return
    }
    if (variant === 'danger' && hasAccountError) {
      navigate('/accounts')
      return
    }
    if (variant === 'muted') {
      navigate('/automations/jonfrey')
      return
    }
    if (variant === 'success') {
      navigate('/activity')
      return
    }
    // warning → open the queue panel
    setPanelOpen(o => !o)
  }

  // Sorted queue items: running first, then by queue_ts
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

  // Close panel on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setPanelOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const runningJobRows = items.filter(isJobRow).filter(j => j.status === 'running')

  const cancelOne = (id: string) => {
    apiClient.post(`/api/jobs/${id}/cancel`).then(() => {
      refetchWQ()
      qc.invalidateQueries({ queryKey: ['jobs'] })
    })
  }
  const cancelAll = () => {
    if (confirm('Cancelar todos os jobs em execução na fila?')) {
      apiClient.post('/api/jobs/cancel-all').then(() => {
        refetchWQ()
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
      refetchWQ()
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-actions-recent'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-actions'] })
    })
  }

  const staleHint =
    (stats?.job_stale_reconciled ?? 0) > 0 || (stats?.jonfrey_stale_reconciled ?? 0) > 0
      ? `Auto-correção: ${stats?.job_stale_reconciled ?? 0} job(s) · ${stats?.jonfrey_stale_reconciled ?? 0} auditoria(s) marcados como falha (running antigo).`
      : null

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={handleClick}
        title={chipTitle[variant]}
        aria-label={`Status do sistema: ${chipLabel[variant]}`}
        className={`${chipClass[variant]} cursor-pointer hover:opacity-80 transition-opacity min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full`}
      >
        <span aria-hidden>{chipIcon[variant]}</span>
        <span className="tabular-nums">{chipLabel[variant]}</span>
        {variant === 'warning' && activeRunningCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" aria-hidden />
        )}
      </button>

      {/* Work queue panel — only shown when variant=warning and panelOpen */}
      {panelOpen && variant === 'warning' && (
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
          {staleHint && (
            <div className="px-3 py-1.5 bg-warning/5 border-b border-border text-[10px] text-warning leading-snug">{staleHint}</div>
          )}
          <div className="overflow-y-auto flex-1 min-h-0">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-fg-3">Nada na fila neste momento.</p>
            )}
            {sortedItems.map((item, idx) => {
              const key = isJobRow(item) ? `job:${item.id}` : `jf:${item.id}:${item.created_at}`
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
                        className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                          j.status === 'running'
                            ? 'bg-accent/10 text-accent'
                            : j.status === 'completed'
                              ? 'bg-success/10 text-success'
                              : j.status === 'failed'
                                ? 'bg-danger/10 text-danger'
                                : 'bg-fg-3/10 text-fg-3'
                        }`}
                      >
                        {j.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-fg-3 mt-0.5 font-mono">{fmtShort(j.queue_ts)} · #{idx + 1}</p>
                    {j.status === 'running' && (
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
              const sum = err || a.reasoning?.trim() || (a.status === 'running' ? 'Em execução…' : '—')
              return (
                <div key={key} className="px-3 py-2 border-b border-border last:border-0 bg-surface-2/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-fg truncate">{a.action_type}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                        a.status === 'running'
                          ? 'bg-accent/10 text-accent'
                          : a.status === 'success'
                            ? 'bg-success/10 text-success'
                            : a.status === 'failed'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-fg-3/10 text-fg-3'
                      }`}
                    >
                      {a.status}
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
      )}
    </div>
  )
}

// ─── Topbar ──────────────────────────────────────────────────────────────────

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation()
  const { override } = usePageTitle()
  const baseTitle = pageTitleFromPath(location.pathname)
  const title = override ?? baseTitle

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

      {/* Page title + search */}
      <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
        {title ? (
          <h1 className="text-sm font-semibold text-fg truncate shrink-0 max-w-[min(42vw,9rem)] sm:max-w-[200px] md:max-w-[240px]">
            {title}
          </h1>
        ) : null}
        <SearchBar />
      </div>

      {/* Single consolidated status zone */}
      <StatusPill />

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
