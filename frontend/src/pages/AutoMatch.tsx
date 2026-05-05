import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { Skeleton } from '../components/ui/Skeleton'

interface AutoMatchLog {
  id: number
  product_id: number
  channel_id: number
  dispatch_id: number
  score: number
  created_at: string
  product_name?: string
  channel_name?: string
}

interface AutoMatchStatus {
  enabled: boolean
  threshold: number
  max_per_run: number
  logs: AutoMatchLog[]
}

export default function AutoMatch() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<AutoMatchStatus>({
    queryKey: ['auto-match'],
    queryFn: () => apiClient.get('/api/auto-match').then(r => r.data),
    refetchInterval: 30_000,
  })

  const toggleMut = useMutation({
    mutationFn: (payload: Partial<{ enabled: boolean; threshold: number; max_per_run: number }>) =>
      apiClient.post('/api/auto-match/toggle', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-match'] }),
  })

  const enabled = data?.enabled ?? false
  const threshold = data?.threshold ?? 50
  const maxPerRun = data?.max_per_run ?? 3
  const logs = data?.logs ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-fg">Auto Match</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Dispara automaticamente produtos que batem com canais, a cada 1 minuto.
        </p>
      </div>

      {/* Toggle principal */}
      <div className={`rounded-xl border-2 transition-colors ${enabled ? 'border-accent bg-accent/5' : 'border-border bg-surface'} p-6`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-fg">{enabled ? 'Auto Match ativado' : 'Auto Match desativado'}</p>
            <p className="text-sm text-fg-3 mt-0.5">
              {enabled
                ? `Rodando a cada 1 min · score mínimo ${threshold} · máx ${maxPerRun} por ciclo`
                : 'Ative para disparar automaticamente produtos matchados.'}
            </p>
          </div>

          {/* Toggle switch grande */}
          <button
            type="button"
            disabled={toggleMut.isPending}
            onClick={() => toggleMut.mutate({ enabled: !enabled })}
            className={`relative w-14 h-7 rounded-full transition-colors focus:outline-none overflow-hidden ${
              enabled ? 'bg-accent' : 'bg-border'
            } ${toggleMut.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-label={enabled ? 'Desativar auto match' : 'Ativar auto match'}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Configurações */}
      <div className="bg-surface border border-border rounded-md p-4 space-y-4">
        <p className="text-sm font-medium text-fg">Parâmetros</p>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs text-fg-2">Score mínimo para disparar (0–100)</span>
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={threshold}
              key={threshold}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v !== threshold) toggleMut.mutate({ threshold: v })
              }}
              className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-2">Máx. disparos por ciclo</span>
            <input
              type="number"
              min={1}
              max={20}
              defaultValue={maxPerRun}
              key={maxPerRun}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v !== maxPerRun) toggleMut.mutate({ max_per_run: v })
              }}
              className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </label>
        </div>
      </div>

      {/* Log de posts auto matched */}
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Últimos disparos automáticos</p>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ['auto-match'] })}
            className="text-xs text-accent hover:underline"
          >
            atualizar
          </button>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 space-y-1">
            <p className="text-sm text-fg-2">Nenhum disparo automático ainda.</p>
            <p className="text-xs text-fg-3">Ative o Auto Match acima para começar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Produto</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Canal</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Quando</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <p className="text-sm text-fg truncate max-w-[200px]">
                      {log.product_name || `#${log.product_id}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-fg">{log.channel_name || `#${log.channel_id}`}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-semibold ${log.score >= 70 ? 'text-success' : log.score >= 50 ? 'text-warning' : 'text-fg-2'}`}>
                      {log.score.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-fg-3">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/logs?dispatchId=${log.dispatch_id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      ver disparo →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
