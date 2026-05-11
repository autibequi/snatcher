import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LLMCostSeriesPoint {
  bucket: string
  cost_usd: number
  requests: number
}

export interface LLMLogRow {
  id: number
  operation: string
  provider: string
  model: string
  status: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  cache_hit: boolean
  error: boolean
  error_msg?: string
  latency_seconds?: number
  prompt: string
  response: string
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeLLMLogRows(raw: unknown): LLMLogRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row: Record<string, unknown>) => {
    const cost = Number(row.cost_usd ?? row.estimated_cost_usd ?? 0)
    return {
      id: Number(row.id ?? 0),
      operation: String(row.operation ?? ''),
      provider: row.provider != null ? String(row.provider) : '',
      model: String(row.model ?? ''),
      status: String(row.status ?? ''),
      tokens_in: Number(row.tokens_in ?? 0),
      tokens_out: Number(row.tokens_out ?? 0),
      cost_usd: Number.isFinite(cost) ? cost : 0,
      cache_hit: Boolean(row.cache_hit),
      error: Boolean(row.error),
      error_msg: row.error_msg != null ? String(row.error_msg) : undefined,
      latency_seconds:
        row.latency_seconds != null && row.latency_seconds !== ''
          ? Number(row.latency_seconds)
          : undefined,
      prompt: row.prompt != null ? String(row.prompt) : '',
      response: row.response != null ? String(row.response) : '',
      created_at: String(row.created_at ?? ''),
    }
  })
}

function llmSnippet(s: string, maxLen = 96): string {
  const t = s.trim()
  if (!t) return '—'
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

const LLM_CLUSTER_GAP_MS = 10 * 60 * 1000

function llmBaseOperation(op: string): string {
  return op
    .replace(/_retry_transient_\d+$/i, '')
    .replace(/_retry_tokens$/i, '')
}

function isLLMRetryFlavorRow(r: LLMLogRow): boolean {
  return (
    r.status === 'rate_limited' ||
    r.operation.includes('_retry_transient') ||
    r.operation.endsWith('_retry_tokens')
  )
}

function clusterLLMLogs(rows: LLMLogRow[]): LLMLogRow[][] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const byKey = new Map<string, LLMLogRow[]>()
  for (const r of sorted) {
    const base = llmBaseOperation(r.operation)
    const key = `${base}\n${r.prompt.trim()}`
    let g = byKey.get(key)
    if (!g) {
      g = []
      byKey.set(key, g)
    }
    g.push(r)
  }
  const out: LLMLogRow[][] = []
  for (const g of byKey.values()) {
    g.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    let chunk: LLMLogRow[] = []
    for (const r of g) {
      if (chunk.length === 0) {
        chunk.push(r)
      } else {
        const prev = chunk[chunk.length - 1]
        const dt = new Date(r.created_at).getTime() - new Date(prev.created_at).getTime()
        if (dt > LLM_CLUSTER_GAP_MS) {
          out.push(chunk)
          chunk = [r]
        } else {
          chunk.push(r)
        }
      }
    }
    if (chunk.length) out.push(chunk)
  }
  return out
}

function pickPrimaryLLMAttempt(rows: LLMLogRow[]): LLMLogRow {
  const desc = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const ok = desc.find(
    r =>
      !r.error &&
      r.status !== 'rate_limited' &&
      (r.response.trim().length > 0 || r.tokens_out > 0),
  )
  return ok ?? desc[0]
}

interface LLMDisplayGroup {
  id: string
  attempts: LLMLogRow[]
  primary: LLMLogRow
}

function stableGroupId(attempts: LLMLogRow[]): string {
  return `grp-${attempts.map(a => a.id).sort((x, y) => x - y).join(':')}`
}

function buildLLMDisplayGroups(rows: LLMLogRow[]): LLMDisplayGroup[] {
  const clusters = clusterLLMLogs(rows)
  const result: LLMDisplayGroup[] = []

  for (const cluster of clusters) {
    const multi = cluster.length > 1
    const hasRetry = cluster.some(isLLMRetryFlavorRow)

    if (!multi) {
      const r = cluster[0]
      result.push({ id: `row-${r.id}`, attempts: cluster, primary: r })
      continue
    }

    if (hasRetry) {
      result.push({
        id: stableGroupId(cluster),
        attempts: cluster,
        primary: pickPrimaryLLMAttempt(cluster),
      })
      continue
    }

    const sortedDesc = [...cluster].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    for (const r of sortedDesc) {
      result.push({ id: `row-${r.id}`, attempts: [r], primary: r })
    }
  }

  return result.sort(
    (a, b) =>
      new Date(b.primary.created_at).getTime() - new Date(a.primary.created_at).getTime(),
  )
}

// ── LLM Cost Chart ────────────────────────────────────────────────────────────

const LLM_COST_DAY_OPTIONS = [7, 14, 30] as const

function LLMCostSpendChart() {
  const [seriesDays, setSeriesDays] = React.useState<(typeof LLM_COST_DAY_OPTIONS)[number]>(14)
  const { data: seriesRaw = [], isLoading } = useQuery({
    queryKey: ['llm-cost-series', seriesDays],
    queryFn: () =>
      apiClient
        .get<LLMCostSeriesPoint[]>(`/api/admin/llm/cost-series?days=${seriesDays}`)
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const chartData = React.useMemo(
    () =>
      seriesRaw.map(p => ({
        label: p.bucket
          ? new Date(p.bucket).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              timeZone: 'UTC',
            })
          : '',
        cost: Number(p.cost_usd ?? 0),
        requests: Number(p.requests ?? 0),
        raw: p.bucket,
      })),
    [seriesRaw],
  )

  const totalCost = chartData.reduce((acc, row) => acc + row.cost, 0)

  return (
    <div className="px-4 py-4 border-b border-border bg-surface-2/40">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">
            Gastos LLM (USD estimado)
          </p>
          <p className="text-[11px] text-fg-3 mt-0.5">
            Últimos {seriesDays} dias · agregado por dia (UTC) · total US${totalCost.toFixed(4)}
          </p>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          {LLM_COST_DAY_OPTIONS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setSeriesDays(d)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                seriesDays === d
                  ? 'bg-accent text-[var(--fg-on-accent,#fff)]'
                  : 'bg-surface text-fg-2 hover:bg-surface-2'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-[140px] w-full rounded-md" />
      ) : chartData.length === 0 ? (
        <p className="text-xs text-fg-3 text-center py-8">Sem pontos para o período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--fg-3, #888)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 10, fill: 'var(--fg-3, #888)' }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) =>
                v >= 0.01 ? `$${v.toFixed(2)}` : v <= 0 ? '$0' : `$${v.toFixed(4)}`
              }
            />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as
                  | { raw?: string; cost?: number; requests?: number }
                  | undefined
                if (!row) return null
                const dateLabel =
                  row.raw != null && row.raw !== ''
                    ? new Date(row.raw).toLocaleString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                    : ''
                const c = typeof row.cost === 'number' && Number.isFinite(row.cost) ? row.cost : 0
                const req =
                  typeof row.requests === 'number' && Number.isFinite(row.requests)
                    ? row.requests
                    : 0
                return (
                  <div
                    className="rounded-md border px-2.5 py-2 text-xs shadow-lg"
                    style={{
                      background: 'var(--surface, #1a1a1a)',
                      borderColor: 'var(--border, #333)',
                    }}
                  >
                    {dateLabel && <p className="mb-1.5 font-medium text-fg">{dateLabel}</p>}
                    <p className="text-fg">
                      <span className="text-fg-3">Custo:</span> US$ {c.toFixed(6)}
                    </p>
                    <p className="mt-1 text-fg-3">
                      {req} requis{req !== 1 ? 'ições' : 'ição'}
                    </p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              name="Custo (USD)"
              stroke="#a855f7"
              fill="rgba(168, 85, 247, 0.22)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LLMTabProps {
  q?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LLMTab({ q = '' }: LLMTabProps) {
  const [errorsOnly, setErrorsOnly] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const { data: rows = [], isLoading, refetch } = useQuery<LLMLogRow[]>({
    queryKey: ['llm-logs', errorsOnly],
    queryFn: () =>
      apiClient
        .get(`/api/admin/llm/logs?limit=200${errorsOnly ? '&errors_only=true' : ''}`)
        .then(r => normalizeLLMLogRows(r.data)),
    refetchInterval: 30_000,
  })

  React.useEffect(() => {
    setExpandedId(null)
  }, [errorsOnly])

  const groups = React.useMemo(() => {
    const g = buildLLMDisplayGroups(rows)
    if (!q) return g
    const lq = q.toLowerCase()
    return g.filter(gr => {
      const r = gr.primary
      return (
        r.operation.toLowerCase().includes(lq) ||
        r.model.toLowerCase().includes(lq) ||
        r.provider.toLowerCase().includes(lq) ||
        r.prompt.toLowerCase().includes(lq) ||
        r.response.toLowerCase().includes(lq)
      )
    })
  }, [rows, q])

  const colCount = 11

  return (
    <div className="bg-surface border border-border rounded-lg shadow-sm">
      <LLMCostSpendChart />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 bg-surface-2 border-b border-border">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={e => setErrorsOnly(e.target.checked)}
              className="accent-accent"
            />
            Apenas erros
          </label>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-accent hover:underline shrink-0"
        >
          atualizar
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-fg-3 p-6 text-center">Carregando...</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-fg-3 p-6 text-center">
          {rows.length === 0 ? 'Nenhum log de LLM.' : 'Nenhum resultado para a busca.'}
        </p>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[1020px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Quando
                </th>
                <th
                  className="text-right px-2 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide w-10"
                  title="Número de tentativas no mesmo fluxo (prompt/op)"
                >
                  #
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Operação
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide whitespace-nowrap">
                  Provider
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Modelo
                </th>
                <th className="text-right px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide whitespace-nowrap">
                  USD
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Enviado
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Recebido
                </th>
                <th className="text-right px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Tok
                </th>
                <th className="text-right px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Dt
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const r = g.primary
                const isExpanded = expandedId === g.id
                const sentPrev = llmSnippet(r.prompt)
                const recvPrev = llmSnippet(r.response)
                const hasStoredPayload =
                  r.prompt.trim().length > 0 || r.response.trim().length > 0
                const attemptCount = g.attempts.length
                const squashRetryOp =
                  attemptCount > 1 && g.attempts.some(isLLMRetryFlavorRow)
                const isTransient =
                  r.operation?.includes('_retry_transient') || r.status === 'rate_limited'
                const isRealError = r.error && !isTransient
                const showOp = squashRetryOp ? llmBaseOperation(r.operation) : r.operation

                return (
                  <React.Fragment key={g.id}>
                    <tr
                      className={`border-b border-border last:border-0 ${
                        isRealError ? 'bg-danger/5' : isTransient ? 'opacity-80' : ''
                      } cursor-pointer hover:bg-surface-2/80`}
                      onClick={() => setExpandedId(isExpanded ? null : g.id)}
                    >
                      <td className="px-3 py-2.5 text-[11px] text-fg-3 whitespace-nowrap align-top leading-snug">
                        <span className="text-fg-3 mr-0.5">{isExpanded ? '▼' : '▶'}</span>
                        {new Date(r.created_at).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-fg-3 font-mono text-right tabular-nums w-10 align-top whitespace-nowrap">
                        {attemptCount}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-[11px] align-top leading-snug ${
                          isTransient ? 'text-fg-3 italic' : 'text-fg'
                        }`}
                      >
                        <span className="line-clamp-2 break-all">{showOp}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono align-top whitespace-nowrap uppercase tracking-tight">
                        {r.provider?.trim() ? r.provider : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono align-top leading-snug">
                        <span className="line-clamp-3 break-all">{r.model || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono text-right align-top whitespace-nowrap tabular-nums">
                        ${r.cost_usd.toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg align-top min-w-0">
                        <p
                          className="line-clamp-2 whitespace-pre-wrap break-words"
                          title={r.prompt.trim() || undefined}
                        >
                          {sentPrev}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] align-top min-w-0">
                        <p
                          className={`line-clamp-2 whitespace-pre-wrap break-words ${
                            isRealError ? 'text-danger' : 'text-fg'
                          }`}
                          title={r.response.trim() || undefined}
                        >
                          {recvPrev}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono text-right align-top whitespace-nowrap tabular-nums">
                        {r.tokens_in}&rarr;{r.tokens_out}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-3 font-mono text-right align-top whitespace-nowrap tabular-nums">
                        {r.latency_seconds != null ? `${r.latency_seconds.toFixed(2)}s` : '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {isTransient ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning rounded-md">
                            {r.status || 'retry'}
                          </span>
                        ) : r.error ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-danger/15 text-danger rounded-md font-medium">
                            erro
                          </span>
                        ) : r.cache_hit ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-accent/15 text-accent rounded-md">
                            cache
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-success/15 text-success rounded-md">
                            {r.status || 'ok'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isRealError && r.error_msg && (
                      <tr className="bg-danger/5 border-b border-border last:border-0">
                        <td colSpan={colCount} className="px-4 py-2 text-xs font-mono text-danger break-all">
                          {r.error_msg}
                        </td>
                      </tr>
                    )}
                    {isTransient && r.error_msg && (
                      <tr className="border-b border-border last:border-0 opacity-60">
                        <td colSpan={colCount} className="px-4 py-1 text-[10px] font-mono text-fg-3 break-all">
                          {r.error_msg}
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr className="border-b border-border last:border-0 bg-surface-2/90">
                        <td colSpan={colCount} className="p-0">
                          <div
                            className="px-4 py-4 space-y-4"
                            onClick={e => e.stopPropagation()}
                            role="presentation"
                          >
                            {!hasStoredPayload && (
                              <p className="text-xs text-fg-3">
                                Nenhum texto de prompt/resposta foi gravado neste registro.
                              </p>
                            )}
                            {attemptCount > 1 && (
                              <details className="group rounded-lg border border-border bg-surface text-xs">
                                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-fg-2 hover:bg-surface-2 rounded-lg">
                                  Histórico de tentativas ({attemptCount})
                                </summary>
                                <ul className="px-3 pb-3 pt-1 space-y-2 border-t border-border max-h-40 overflow-auto">
                                  {[...g.attempts]
                                    .sort(
                                      (a, b) =>
                                        new Date(b.created_at).getTime() -
                                        new Date(a.created_at).getTime(),
                                    )
                                    .map(a => (
                                      <li
                                        key={a.id}
                                        className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-fg-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                                      >
                                        <span className="text-fg-2 shrink-0">
                                          {new Date(a.created_at).toLocaleString('pt-BR', {
                                            dateStyle: 'short',
                                            timeStyle: 'medium',
                                          })}
                                        </span>
                                        <span className="text-fg shrink-0">{a.operation}</span>
                                        {a.provider?.trim() ? (
                                          <span className="text-fg-2 shrink-0 uppercase">
                                            {a.provider}
                                          </span>
                                        ) : null}
                                        <span className={a.error ? 'text-danger' : 'text-fg-3'}>
                                          {a.status}
                                        </span>
                                        {a.error_msg && (
                                          <span className="text-danger break-all w-full">
                                            {a.error_msg}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                </ul>
                              </details>
                            )}
                            <div className="flex flex-col lg:flex-row gap-3 min-h-[min(70vh,520px)] max-h-[75vh]">
                              <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
                                <div className="shrink-0 px-3 py-2 border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-fg-2">
                                  Mensagem enviada
                                </div>
                                <pre className="flex-1 min-h-[220px] lg:min-h-0 overflow-auto p-3 text-xs font-mono text-fg whitespace-pre-wrap break-words leading-relaxed">
                                  {r.prompt.trim() ? r.prompt : '(vazio)'}
                                </pre>
                              </div>
                              <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
                                <div className="shrink-0 px-3 py-2 border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-fg-2">
                                  Mensagem recebida
                                </div>
                                <pre
                                  className={`flex-1 min-h-[220px] lg:min-h-0 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed ${
                                    r.error ? 'text-danger' : 'text-fg'
                                  }`}
                                >
                                  {r.response.trim() ? r.response : '(vazio)'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
