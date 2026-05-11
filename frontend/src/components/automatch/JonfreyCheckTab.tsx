import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'
import {
  tblDense,
  thDense,
  tdDense,
  trDense,
} from '../../lib/uiTokens'

// Tipos espelham reviewDispatchesResp em backend-go/internal/handlers/admin/jonfrey_review.go.
// "duplicado" foi adicionado no backend (commit anterior) — significa que o mesmo
// produto bateu no mesmo grupo várias vezes no período (auto-match em loop).
interface JonfreyReviewItem {
  dispatch_id: number
  short_id: string
  group: string
  product: string
  assessment: 'ok' | 'problema' | 'produto_errado' | 'duplicado' | 'pendente' | string
  note: string
}

export interface JonfreyReviewResult {
  headline: string
  items: JonfreyReviewItem[]
  generated_at: string
  cached_for_seconds?: number
}

// ── Dicionário de veredictos ──────────────────────────────────────────────────
//
// Cor + label PT alinhados com o resto do app (mesma família OKLCH usada em
// statusChip*). "duplicado" usa accent porque é o sinal "olha aqui" — não é
// fora do nicho (vermelho), mas também não é OK (verde).

const ASSESSMENT_LABELS: Record<string, { label: string; cls: string }> = {
  ok:             { label: 'OK',             cls: 'text-success' },
  problema:       { label: 'Problema',       cls: 'text-warning' },
  produto_errado: { label: 'Produto errado', cls: 'text-danger'  },
  duplicado:      { label: 'Duplicado',      cls: 'text-accent'  },
  pendente:       { label: 'Pendente',       cls: 'text-fg-3'    },
}

// Ordena por gravidade — usuário quer ver problemas primeiro.
const ASSESSMENT_PRIORITY: Record<string, number> = {
  produto_errado: 0,
  duplicado:      1,
  problema:       2,
  pendente:       3,
  ok:             4,
}

// Quais veredictos contam para o "contador de problemas" exibido na aba.
// Pendente NÃO conta — é falta de dados, não erro do auto-match.
const PROBLEM_ASSESSMENTS = new Set<string>([
  'problema',
  'produto_errado',
  'duplicado',
])

export function countJonfreyProblems(data: JonfreyReviewResult | undefined): number {
  if (!data?.items?.length) return 0
  return data.items.filter(it => PROBLEM_ASSESSMENTS.has(it.assessment)).length
}

function formatRemaining(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `expira em ${mins}min`
  const hrs = Math.floor(mins / 60)
  return `expira em ${hrs}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`
}

// ── Hook compartilhado ────────────────────────────────────────────────────────
//
// Exposto para que o Layout/Tab pai consiga ler o contador (problemas)
// SEM duplicar request — react-query deduplica pela mesma queryKey.

export const JONFREY_REVIEW_QUERY_KEY = ['automatch', 'jonfrey-review-24h'] as const

export function useJonfreyReview() {
  return useQuery<JonfreyReviewResult>({
    queryKey: JONFREY_REVIEW_QUERY_KEY,
    queryFn: () =>
      apiClient
        .get('/api/jonfrey/review-dispatches', { timeout: 120_000 })
        .then(r => r.data as JonfreyReviewResult),
    staleTime: 5 * 60_000,
    retry: 0,
  })
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export function JonfreyCheckTab() {
  const qc = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, isLoading, isError, isFetching } = useJonfreyReview()

  const refresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      const res = await apiClient.get('/api/jonfrey/review-dispatches', {
        params: { force: 1 },
        timeout: 120_000,
      })
      qc.setQueryData(JONFREY_REVIEW_QUERY_KEY, res.data)
    } catch {
      // mantém cache anterior; useQuery re-tenta no próximo focus.
    } finally {
      setIsRefreshing(false)
    }
  }

  const items = data?.items
  const itemsSorted = useMemo(() => {
    if (!items) return []
    return [...items].sort((a, b) => {
      const pa = ASSESSMENT_PRIORITY[a.assessment] ?? 9
      const pb = ASSESSMENT_PRIORITY[b.assessment] ?? 9
      return pa - pb
    })
  }, [items])

  const problemCount = useMemo(() => countJonfreyProblems(data), [data])

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-md p-6">
        <p className="text-sm text-fg-3">Analisando auto-disparo das últimas 24h…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-surface border border-border rounded-md p-6 space-y-2">
        <p className="text-sm text-fg">Análise indisponível</p>
        <p className="text-xs text-fg-3">
          A LLM não respondeu — pode estar offline ou sobrecarregada. Tente em alguns segundos.
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing || isFetching}
          className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1 disabled:opacity-50"
        >
          {isRefreshing ? '⏳' : '↻ Tentar de novo'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      {/* Header da aba */}
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-fg">Revisão Jonfrey · últimas 24h</p>
            {problemCount > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning-soft text-warning font-mono tabular-nums"
                title="Itens com problema, produto fora do nicho ou disparo duplicado"
              >
                {problemCount}
              </span>
            )}
          </div>
          <p className="text-xs text-fg-3 mt-0.5 leading-snug">
            {data.items.length === 0
              ? data.headline
              : `${data.items.length} disparo${data.items.length !== 1 ? 's' : ''} avaliados pela LLM · grupo de notificação recebe alerta quando há anomalia.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data.cached_for_seconds !== undefined && data.cached_for_seconds > 0 && (
            <span className="text-[10px] text-fg-3 whitespace-nowrap">
              {formatRemaining(data.cached_for_seconds)}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing || isFetching}
            title="Forçar nova análise (ignora cache)"
            className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isRefreshing ? '⏳' : '↻'}
          </button>
        </div>
      </div>

      {/* Headline destacado quando há itens (LLM resume o período) */}
      {data.items.length > 0 && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/40">
          <p className="text-sm text-fg leading-snug">{data.headline}</p>
        </div>
      )}

      {/* Tabela */}
      {data.items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-fg-3">Nenhum disparo no período — nada para revisar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={tblDense}>
            <colgroup>
              {/*
                Larguras fixas para Produto/Grupo (textos curtos, podem truncar
                com tooltip) e Veredicto, deixando Comentário como flex (auto)
                para receber o restante do espaço — pedido explícito do user.
                Em viewports estreitos a tabela vira scroll horizontal pelo
                wrapper acima.
              */}
              <col className="w-[180px]" />
              <col className="w-[160px]" />
              <col className="w-[110px]" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className={thDense}>Produto</th>
                <th className={thDense}>Grupo</th>
                <th className={thDense}>Veredicto</th>
                <th className={thDense}>Comentário</th>
              </tr>
            </thead>
            <tbody>
              {itemsSorted.map(item => {
                const meta = ASSESSMENT_LABELS[item.assessment] ?? {
                  label: item.assessment || '—',
                  cls: 'text-fg-2',
                }
                return (
                  <tr key={item.dispatch_id} className={`${trDense} align-top`}>
                    <td
                      className={`${tdDense} text-fg`}
                      title={item.product || undefined}
                    >
                      <span className="block truncate max-w-[180px]">
                        {item.product || '—'}
                      </span>
                    </td>
                    <td
                      className={`${tdDense} text-fg-2`}
                      title={item.group || undefined}
                    >
                      <span className="block truncate max-w-[160px]">
                        {item.group || '—'}
                      </span>
                    </td>
                    <td className={`${tdDense} font-medium ${meta.cls} whitespace-nowrap`}>
                      {meta.label}
                    </td>
                    <td className={`${tdDense} text-fg-2 leading-snug`}>
                      {item.note || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-2 border-t border-border text-[10px] text-fg-3 font-mono">
        gerado em {new Date(data.generated_at).toLocaleString('pt-BR')}
      </div>
    </div>
  )
}
