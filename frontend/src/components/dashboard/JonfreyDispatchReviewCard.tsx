import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionHeader, sectionTitle, sectionSubtitle } from '../../lib/uiTokens'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface JonfreyReviewItem {
  dispatch_id: number
  short_id: string
  group: string
  product: string
  assessment: string  // "ok" | "problema" | "produto_errado" | "pendente"
  note: string
}

interface JonfreyReviewResult {
  headline: string
  items: JonfreyReviewItem[]
  generated_at: string
  cached_for_seconds?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ASSESSMENT_LABELS: Record<string, { label: string; cls: string }> = {
  ok:             { label: 'OK',             cls: 'text-success' },
  problema:       { label: 'Problema',       cls: 'text-warning' },
  produto_errado: { label: 'Produto errado', cls: 'text-danger' },
  pendente:       { label: 'Pendente',       cls: 'text-fg-3' },
}

// Ordena pra mostrar o que mais importa no topo: produto_errado > problema > pendente > ok.
const ASSESSMENT_PRIORITY: Record<string, number> = {
  produto_errado: 0,
  problema:       1,
  pendente:       2,
  ok:             3,
}

function formatRemaining(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `expira em ${mins}min`
  const hrs = Math.floor(mins / 60)
  return `expira em ${hrs}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`
}

// ── Componente ────────────────────────────────────────────────────────────────

export function JonfreyDispatchReviewCard() {
  const qc = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Carrega automaticamente — server cacheia 1h, staleTime do react-query 5min
  // pra evitar refetch agressivo a cada navegação. ?force=1 trata como CTA explícito.
  const { data, isLoading, isError, isFetching } = useQuery<JonfreyReviewResult>({
    queryKey: ['dashboard', 'jonfrey-review-24h'],
    queryFn: () =>
      apiClient
        .get('/api/jonfrey/review-dispatches', { timeout: 120_000 })
        .then(r => r.data as JonfreyReviewResult),
    staleTime: 5 * 60_000,
    retry: 0,
  })

  const refresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      const res = await apiClient.get('/api/jonfrey/review-dispatches', {
        params: { force: 1 },
        timeout: 120_000,
      })
      qc.setQueryData(['dashboard', 'jonfrey-review-24h'], res.data)
    } catch {
      // Mantém o cache anterior; estado de erro vai aparecer quando o useQuery
      // re-tentar no próximo mount/foco.
    } finally {
      setIsRefreshing(false)
    }
  }

  // Itens ordenados (problemas no topo)
  const itemsSorted = data?.items
    ? [...data.items].sort((a, b) => {
        const pa = ASSESSMENT_PRIORITY[a.assessment] ?? 9
        const pb = ASSESSMENT_PRIORITY[b.assessment] ?? 9
        return pa - pb
      })
    : []

  // Render

  if (isLoading) {
    return (
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <div>
            <h2 className={sectionTitle}>Revisão Jonfrey · 24h</h2>
            <p className={sectionSubtitle}>Analisando auto-disparo…</p>
          </div>
        </div>
        <p className="text-xs text-fg-3 py-2">Carregando análise da LLM…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <div>
            <h2 className={sectionTitle}>Revisão Jonfrey · 24h</h2>
            <p className={sectionSubtitle}>Análise indisponível</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing || isFetching}
            className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1 disabled:opacity-50"
          >
            {isRefreshing ? '⏳' : '↻'}
          </button>
        </div>
        <p className="text-xs text-fg-3">
          A LLM não respondeu — pode estar offline ou sobrecarregada. Tente em alguns segundos.
        </p>
      </div>
    )
  }

  return (
    <div className={sectionCard}>
      <div className={sectionHeader}>
        <div>
          <h2 className={sectionTitle}>Revisão Jonfrey · 24h</h2>
          <p className={sectionSubtitle}>
            {data.items.length === 0
              ? data.headline
              : `${data.items.length} disparo${data.items.length !== 1 ? 's' : ''} avaliados pela LLM`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.cached_for_seconds !== undefined && data.cached_for_seconds > 0 && (
            <span className="text-[10px] text-fg-3">{formatRemaining(data.cached_for_seconds)}</span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing || isFetching}
            title="Forçar nova análise (ignora cache)"
            className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefreshing ? '⏳' : '↻'}
          </button>
        </div>
      </div>

      {data.items.length > 0 && (
        <p className="text-sm text-fg mb-3">{data.headline}</p>
      )}

      {data.items.length === 0 ? (
        <p className="text-xs text-fg-3 py-2">Nenhuma anomalia para revisar.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Grupo</th>
                <th className="text-left text-fg-3 font-medium py-1.5 pr-3">Produto</th>
                <th className="text-left text-fg-3 font-medium py-1.5 pr-3 whitespace-nowrap">Veredicto</th>
                <th className="text-left text-fg-3 font-medium py-1.5">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {itemsSorted.map(item => {
                const { label, cls } = ASSESSMENT_LABELS[item.assessment] ?? { label: item.assessment, cls: 'text-fg-2' }
                return (
                  <tr key={item.dispatch_id} className="border-b border-border last:border-0 align-top">
                    <td className="py-1.5 pr-3 text-fg whitespace-nowrap">{item.group || '—'}</td>
                    <td className="py-1.5 pr-3 text-fg max-w-[220px] truncate" title={item.product || undefined}>
                      {item.product || '—'}
                    </td>
                    <td className={`py-1.5 pr-3 font-medium ${cls} whitespace-nowrap`}>{label}</td>
                    <td className="py-1.5 text-fg-2">{item.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-fg-3 mt-3">
        Gerado em {new Date(data.generated_at).toLocaleString('pt-BR')}
      </p>
    </div>
  )
}
