import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'

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

function isJobRow(item: WorkQueueItem): item is WorkQueueJobRow {
  return item.kind === 'job'
}

function isQueueItemRunning(item: WorkQueueItem): boolean {
  return item.status === 'running'
}

/** Qualquer linha já finalizada (jobs failed/completed + auditoria Jonfrey success/failed/…) */
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

/** Badge + painel: fila FIFO unificada — jobs persistidos (PostgreSQL) + auditoria Jonfrey (GET /api/work-queue). */
export function WorkQueueBadge() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data, refetch } = useQuery({
    queryKey: ['work-queue'],
    queryFn: () =>
      apiClient.get<WorkQueuePayload>('/api/work-queue').then(r => r.data ?? { items: [] }),
    refetchInterval: open ? 2_500 : 8_000,
    retry: false,
  })

  const items = data?.items ?? []
  const stats = data?.stats

  /** Jobs + auditorias Jonfrey com status running — todos contam como “ativo” na barra. */
  const activeRunningCount = useMemo(() => items.filter(isQueueItemRunning).length, [items])

  /** Running primeiro (FIFO por queue_ts dentro do grupo), depois restantes. */
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const runningJobRows = items.filter(isJobRow).filter(j => j.status === 'running')
  const jobRows = items.filter(isJobRow)

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          activeRunningCount > 0
            ? 'bg-accent/10 text-accent hover:bg-accent/20'
            : 'bg-surface-2 text-fg-3 hover:text-fg'
        }`}
        title="Fila universal (FIFO): jobs no PostgreSQL + Jonfrey"
      >
        {activeRunningCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        )}
        ⏱{' '}
        {activeRunningCount > 0
          ? `${activeRunningCount} ativo(s)`
          : items.length > 0
            ? `${items.length} item(ns)`
            : 'fila'}
      </button>
      {open && (
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
