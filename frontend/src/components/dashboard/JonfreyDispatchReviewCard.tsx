import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionHeader, sectionTitle, sectionSubtitle } from '../../lib/uiTokens'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface DispatchItem {
  id: number
  short_id: string
  composed_by: string
  status: string
  created_at: string
  // group/product enrichment — presentes apenas quando disponível (auto_match_log)
  channel_name?: string | null
  product_name?: string | null
}

interface JonfreyReviewResult {
  headline: string
  items: Array<{
    dispatch_id: number
    short_id: string
    group: string
    product: string
    assessment: string  // "ok" | "problema" | "produto_errado" | "pendente"
    note: string
  }>
  generated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Rascunho',  cls: 'text-fg-3' },
  pending_approval: { label: 'Aprovação', cls: 'text-warning' },
  queued:           { label: 'Na fila',   cls: 'text-accent' },
  sending:          { label: 'Enviando',  cls: 'text-accent' },
  completed:        { label: 'Enviado',   cls: 'text-success' },
  failed:           { label: 'Falhou',    cls: 'text-danger' },
  cancelled:        { label: 'Cancelado', cls: 'text-fg-3' },
}

const ASSESSMENT_LABELS: Record<string, { label: string; cls: string }> = {
  ok:            { label: 'OK',            cls: 'text-success' },
  problema:      { label: 'Problema',      cls: 'text-warning' },
  produto_errado:{ label: 'Produto errado',cls: 'text-danger' },
  pendente:      { label: 'Pendente',      cls: 'text-fg-3' },
}

function formatRelativeTime(isoStr: string): string {
  const delta = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(delta / 60_000)
  if (mins < 60) return `${mins}min atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

function is24h(isoStr: string): boolean {
  return Date.now() - new Date(isoStr).getTime() < 24 * 60 * 60 * 1000
}

// ── Componente ────────────────────────────────────────────────────────────────

export function JonfreyDispatchReviewCard() {
  const [reviewing, setReviewing] = useState(false)
  const [review, setReview] = useState<JonfreyReviewResult | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  // Busca os últimos 50 dispatches e filtra os das últimas 24h no cliente
  const { data: allDispatches = [], isLoading } = useQuery<DispatchItem[]>({
    queryKey: ['dashboard', 'dispatches-24h-review'],
    queryFn: () =>
      apiClient
        .get('/api/dispatches')
        .then(r => (Array.isArray(r.data) ? (r.data as DispatchItem[]) : []))
        .catch(() => []),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  })

  const dispatches24h = allDispatches.filter(d => is24h(d.created_at))
  const totalCount = dispatches24h.length

  // Contagem por status para resumo
  const statusCounts = dispatches24h.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1
    return acc
  }, {})

  const failedCount = statusCounts['failed'] ?? 0
  const completedCount = statusCounts['completed'] ?? 0

  // ── Ação: analisar com Jonfrey ──────────────────────────────────────────────
  //
  // TODO (backend): implementar POST /api/jonfrey/review-dispatches
  // Payload esperado: { period_hours: 24 }
  // Resposta esperada: JonfreyReviewResult
  //   { headline, items[{ dispatch_id, short_id, group, product, assessment, note }], generated_at }
  // O endpoint deve usar o LLM para analisar os dispatches das últimas 24h,
  // identificar produtos enviados para grupos errados e retornar avaliação por item.
  //
  async function handleAnalyze() {
    if (reviewing) return
    setReviewing(true)
    setReviewError(null)
    setReview(null)

    try {
      // Override do timeout default (30s) — análise LLM pode levar 60-90s no caminho feliz.
      const res = await apiClient.post(
        '/api/jonfrey/review-dispatches',
        { period_hours: 24 },
        { timeout: 120_000 },
      )
      setReview(res.data as JonfreyReviewResult)
    } catch (err: unknown) {
      const e = err as {
        code?: string
        response?: { status?: number; data?: { error?: string } }
      }
      if (e?.response?.status === 404) {
        // Endpoint ainda não implementado no backend
        setReviewError('endpoint_pending')
      } else if (e?.code === 'ECONNABORTED') {
        setReviewError('A análise demorou demais (>120s). O LLM pode estar sobrecarregado — tente novamente em alguns segundos.')
      } else {
        setReviewError(e?.response?.data?.error ?? 'Erro ao gerar análise')
      }
    } finally {
      setReviewing(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={sectionCard}>
      {/* Cabeçalho */}
      <div className={sectionHeader}>
        <div>
          <h2 className={sectionTitle}>Revisao Jonfrey · 24h</h2>
          <p className={sectionSubtitle}>
            {isLoading
              ? 'Carregando dispatches...'
              : `${totalCount} disparo${totalCount !== 1 ? 's' : ''} nas ultimas 24h`}
          </p>
        </div>

        {!review && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={reviewing || totalCount === 0 || isLoading}
            className="text-xs bg-accent text-white rounded px-3 py-1.5 hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {reviewing ? 'Analisando...' : 'Analisar com Jonfrey'}
          </button>
        )}

        {review && (
          <button
            type="button"
            onClick={() => setReview(null)}
            className="text-xs text-fg-3 hover:text-fg border border-border rounded px-2 py-1"
          >
            Nova analise
          </button>
        )}
      </div>

      {/* Resumo de status das ultimas 24h */}
      {!isLoading && totalCount > 0 && !review && (
        <div className="flex flex-wrap gap-3 mb-3">
          {Object.entries(statusCounts).map(([status, count]) => {
            const { label, cls } = STATUS_LABELS[status] ?? { label: status, cls: 'text-fg-2' }
            return (
              <span key={status} className="text-xs">
                <span className={`font-semibold ${cls}`}>{count}</span>{' '}
                <span className="text-fg-3">{label}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Alertas rapidos de falha */}
      {!isLoading && failedCount > 0 && !review && (
        <div className="text-xs text-danger bg-danger-soft rounded px-3 py-2 mb-3">
          {failedCount} disparo{failedCount > 1 ? 's' : ''} falharam nas ultimas 24h — verifique os grupos.
        </div>
      )}

      {/* Estado vazio */}
      {!isLoading && totalCount === 0 && (
        <p className="text-xs text-fg-3 py-2">Nenhum disparo nas ultimas 24h.</p>
      )}

      {/* Endpoint pendente */}
      {reviewError === 'endpoint_pending' && (
        <div className="rounded border border-border bg-surface-2 p-3 text-xs text-fg-2 space-y-1">
          <p className="font-semibold text-fg">Analise indisponivel</p>
          <p>
            O endpoint <code className="bg-surface px-1 rounded">POST /api/jonfrey/review-dispatches</code> ainda nao existe no backend.
          </p>
          <p className="text-fg-3">
            Para implementar: receber <code>&#123; period_hours: 24 &#125;</code>, buscar os dispatches do periodo com grupo e produto, enviar ao LLM para identificar problemas de produto/grupo errado, retornar avaliacao por item.
          </p>
          <p className="mt-2 text-fg-3">
            Nos ultimas 24h: <span className="font-medium text-fg">{completedCount}</span> enviados,{' '}
            <span className={`font-medium ${failedCount > 0 ? 'text-danger' : 'text-fg'}`}>{failedCount}</span> falharam.
          </p>
        </div>
      )}

      {/* Erro generico */}
      {reviewError && reviewError !== 'endpoint_pending' && (
        <div className="text-xs text-danger bg-danger-soft rounded px-3 py-2">
          {reviewError}
        </div>
      )}

      {/* Resultado da analise Jonfrey */}
      {review && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-fg">{review.headline}</p>

          {review.items.length === 0 && (
            <p className="text-xs text-fg-3">Nenhuma anomalia detectada nas ultimas 24h.</p>
          )}

          {review.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Grupo</th>
                    <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Produto</th>
                    <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Status</th>
                    <th className="text-left text-fg-3 font-medium py-1.5">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {review.items.map(item => {
                    const { label, cls } = ASSESSMENT_LABELS[item.assessment] ?? { label: item.assessment, cls: 'text-fg-2' }
                    return (
                      <tr key={item.dispatch_id} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-3 text-fg">{item.group || '—'}</td>
                        <td className="py-1.5 pr-3 text-fg max-w-[140px] truncate">{item.product || '—'}</td>
                        <td className={`py-1.5 pr-3 font-medium ${cls}`}>{label}</td>
                        <td className="py-1.5 text-fg-3">{item.note || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-fg-3">
            Gerado em {new Date(review.generated_at).toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      {/* Lista resumida dos dispatches das ultimas 24h (quando sem analise) */}
      {!review && !reviewError && !isLoading && dispatches24h.length > 0 && (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-fg-3 font-medium py-1.5 pr-3">ID</th>
                <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Via</th>
                <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Status</th>
                <th className="text-left text-fg-3 font-medium py-1.5">Criado</th>
              </tr>
            </thead>
            <tbody>
              {dispatches24h.slice(0, 10).map(d => {
                const { label, cls } = STATUS_LABELS[d.status] ?? { label: d.status, cls: 'text-fg-2' }
                return (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="py-1.5 pr-3 font-mono text-fg-2">{d.short_id}</td>
                    <td className="py-1.5 pr-3 text-fg-2">{d.composed_by || '—'}</td>
                    <td className={`py-1.5 pr-3 font-medium ${cls}`}>{label}</td>
                    <td className="py-1.5 text-fg-3">{formatRelativeTime(d.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {dispatches24h.length > 10 && (
            <p className="text-[10px] text-fg-3 mt-1.5">
              + {dispatches24h.length - 10} mais — clique em &quot;Analisar com Jonfrey&quot; para ver a analise completa.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
