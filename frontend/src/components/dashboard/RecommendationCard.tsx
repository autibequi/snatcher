import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'

interface Recommendation {
  headline: string
  reason: string
  actions: string[]
  generated_at: string
  cached_for_seconds: number
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'expirou'
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `expira em ${mins}min`
  const hrs = Math.floor(mins / 60)
  return `expira em ${hrs}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`
}

export function RecommendationCard() {
  const qc = useQueryClient()

  const { data, isLoading, isError, isFetching } = useQuery<Recommendation>({
    queryKey: ['dashboard', 'recommendation'],
    queryFn: () =>
      apiClient.get('/api/dashboard/recommendation').then(r => r.data),
    staleTime: 60 * 60 * 1000, // 1h — backend já cacheia
    retry: 0,
  })

  const refresh = () => {
    apiClient
      .get('/api/dashboard/recommendation?force=1')
      .then(() => qc.invalidateQueries({ queryKey: ['dashboard', 'recommendation'] }))
  }

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-md p-4">
        <p className="text-xs text-fg-3">Gerando recomendação…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-surface border border-border rounded-md p-4 flex items-center justify-between gap-3">
        <p className="text-xs text-fg-3">Recomendação indisponível (LLM não configurado?)</p>
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1"
        >
          Tentar
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-accent/40 rounded-md p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <p className="text-sm font-semibold text-fg">{data.headline}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-fg-3">
            {formatRemaining(data.cached_for_seconds)}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={isFetching}
            title="Forçar nova recomendação"
            className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1 disabled:opacity-50"
          >
            ↻
          </button>
        </div>
      </div>
      {data.reason && <p className="text-xs text-fg-2 mt-2">{data.reason}</p>}
      {data.actions && data.actions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {data.actions.map((a, i) => (
            <li key={i} className="text-xs text-fg-2 flex gap-1.5">
              <span className="text-accent">{i + 1}.</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
