import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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
  last_run_at: string | null
  interval_seconds: number
}

interface PreviewItem {
  product_id: number
  channel_id: number
  product_name: string
  channel_name: string
  score: number
  already_sent: boolean
}

// Countdown component — atualiza a cada 1s
function Countdown({ lastRunAt, intervalSeconds, onRefetch }: {
  lastRunAt: string | null
  intervalSeconds: number
  onRefetch: () => void
}) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const refetchCalled = useRef(false)

  useEffect(() => {
    refetchCalled.current = false

    function tick() {
      if (!lastRunAt) {
        setRemaining(null)
        return
      }
      const nextRun = new Date(lastRunAt).getTime() + intervalSeconds * 1000
      const diff = Math.round((nextRun - Date.now()) / 1000)
      setRemaining(diff)

      if (diff <= 0 && !refetchCalled.current) {
        refetchCalled.current = true
        onRefetch()
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastRunAt, intervalSeconds, onRefetch])

  if (remaining === null) return null

  if (remaining <= 0) {
    return (
      <div className="text-xs text-fg-3 bg-surface-2 border border-border rounded-md px-3 py-2">
        Executando...
      </div>
    )
  }

  return (
    <div className="text-xs text-fg-3 bg-surface-2 border border-border rounded-md px-3 py-2">
      Proxima execucao automatica em{' '}
      <span className="font-semibold text-fg">{remaining}s</span>
    </div>
  )
}

// HoverPreview — popover com preview da mensagem ao hover
function HoverPreview({ productId, channelId }: { productId: number; channelId: number }) {
  const [visible, setVisible] = useState(false)

  const { data, isFetching } = useQuery<{ text: string; hashtags?: string[] }>({
    queryKey: ['compose-preview', productId, channelId],
    queryFn: () =>
      apiClient
        .post('/api/compose/preview', { product_id: productId, channel_id: channelId })
        .then(r => r.data),
    enabled: visible,
    staleTime: 5 * 60_000,
  })

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="text-xs text-fg-3 underline decoration-dotted cursor-help">preview</span>
      {visible && (
        <div
          className="absolute z-50 left-0 top-5 w-64 bg-surface border border-border rounded-md shadow-lg p-3 text-xs text-fg pointer-events-none"
          style={{ minWidth: '220px' }}
        >
          {isFetching ? (
            <span className="text-fg-3">carregando...</span>
          ) : data ? (
            <pre className="whitespace-pre-wrap font-sans break-words">{data.text}</pre>
          ) : (
            <span className="text-fg-3">sem preview disponivel</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function AutoMatch() {
  const qc = useQueryClient()

  const { data, isLoading, refetch: refetchStatus } = useQuery<AutoMatchStatus>({
    queryKey: ['auto-match'],
    queryFn: () => apiClient.get('/api/auto-match').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: previewData, refetch: refetchPreview, isFetching: previewFetching } = useQuery<{ items: PreviewItem[]; threshold: number; max_per_run: number }>({
    queryKey: ['auto-match-preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data),
    staleTime: 60_000,
  })

  const toggleMut = useMutation({
    mutationFn: (payload: Partial<{ enabled: boolean; threshold: number; max_per_run: number }>) =>
      apiClient.post('/api/auto-match/toggle', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-match'] }),
  })

  const runNowMut = useMutation({
    mutationFn: () =>
      apiClient.post<{ dispatched: number; errors: string[] }>('/api/auto-match/run-now', {}).then(r => r.data),
    onSuccess: (res) => {
      alert(`${res.dispatched} disparo(s) enviado(s).` + (res.errors.length ? `\nErros: ${res.errors.join(', ')}` : ''))
      qc.invalidateQueries({ queryKey: ['auto-match'] })
      qc.invalidateQueries({ queryKey: ['auto-match-preview'] })
    },
    onError: () => alert('Erro ao disparar ciclo.'),
  })

  const dispatchOneMut = useMutation({
    mutationFn: (vars: { product_id: number; channel_id: number }) =>
      apiClient.post<{ dispatch_id: number }>('/api/auto-match/dispatch-one', vars).then(r => r.data),
    onSuccess: (_res, vars) => {
      alert('Disparado com sucesso.')
      qc.invalidateQueries({ queryKey: ['auto-match-preview'] })
      qc.invalidateQueries({ queryKey: ['compose-preview', vars.product_id, vars.channel_id] })
    },
    onError: () => alert('Erro ao disparar item.'),
  })

  const enabled = data?.enabled ?? false
  const threshold = data?.threshold ?? 50
  const maxPerRun = data?.max_per_run ?? 3
  const logs = data?.logs ?? []
  const lastRunAt = data?.last_run_at ?? null
  const intervalSeconds = data?.interval_seconds ?? 60

  // Aprovações pendentes
  const { data: pendingApprovals = [], refetch: refetchPending } = useQuery<Array<{
    id: number
    channel_name?: string
    product_name?: string
    score?: number
    affiliate_link: string
    created_at: string
  }>>({
    queryKey: ['dispatches', 'pending-approval'],
    queryFn: () => apiClient.get('/api/dispatches/pending-approval').then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/approve`),
    onSuccess: () => { refetchPending(); qc.invalidateQueries({ queryKey: ['dispatches'] }) },
  })
  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/reject`),
    onSuccess: () => refetchPending(),
  })
  const approveAllMut = useMutation({
    mutationFn: () => apiClient.post('/api/dispatches/approve-all').then(r => r.data as { approved: number }),
    onSuccess: (res) => { alert(`${res.approved} disparo(s) aprovado(s).`); refetchPending() },
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm text-fg-3">
          Dispara automaticamente produtos que batem com canais, a cada 1 minuto.
        </p>
      </div>

      {/* Painel de Aprovações Pendentes */}
      {pendingApprovals.length > 0 && (
        <div className="bg-warning/5 border border-warning/30 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-warning/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warning">⏳ Aguardando aprovação</span>
              <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded-full font-mono">
                {pendingApprovals.length}
              </span>
            </div>
            <button
              onClick={() => approveAllMut.mutate()}
              disabled={approveAllMut.isPending}
              className="text-xs px-3 py-1.5 rounded bg-success text-white hover:bg-success/90 disabled:opacity-50"
            >
              ✓ Aprovar todos
            </button>
          </div>
          <div className="divide-y divide-border">
            {pendingApprovals.map(d => (
              <div key={d.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">
                    {d.product_name || `Dispatch #${d.id}`}
                  </p>
                  <p className="text-xs text-fg-3">
                    {d.channel_name && <span className="mr-2">→ {d.channel_name}</span>}
                    {d.score !== undefined && (
                      <span className={`font-mono ${d.score >= 70 ? 'text-success' : 'text-warning'}`}>
                        score {d.score.toFixed(0)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => approveMut.mutate(d.id)}
                    disabled={approveMut.isPending}
                    className="text-xs px-2.5 py-1 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20"
                  >
                    ✓ Aprovar
                  </button>
                  <button
                    onClick={() => rejectMut.mutate(d.id)}
                    disabled={rejectMut.isPending}
                    className="text-xs px-2.5 py-1 rounded bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
                  >
                    ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timer countdown */}
      {enabled && (
        <Countdown
          lastRunAt={lastRunAt}
          intervalSeconds={intervalSeconds}
          onRefetch={() => refetchStatus()}
        />
      )}

      {/* Toggle principal */}
      <div className={`rounded-xl border-2 transition-colors ${enabled ? 'border-accent bg-accent/5' : 'border-border bg-surface'} p-6`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-fg">{enabled ? 'Auto Match ativado' : 'Auto Match desativado'}</p>
            <p className="text-sm text-fg-3 mt-0.5">
              {enabled
                ? `Rodando a cada 1 min · score minimo ${threshold} · max ${maxPerRun} por ciclo`
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

      {/* Configuracoes */}
      <div className="bg-surface border border-border rounded-md p-4 space-y-4">
        <p className="text-sm font-medium text-fg">Parametros</p>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs text-fg-2">Score minimo para disparar (0-100)</span>
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
            <span className="text-xs text-fg-2">Max. disparos por ciclo</span>
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

      {/* Proximo ciclo — preview */}
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-fg">Proximo ciclo — o que seria disparado</p>
            <p className="text-xs text-fg-3">Produtos com score &ge; {threshold} que serao enviados na proxima iteracao</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={runNowMut.isPending}
              onClick={() => runNowMut.mutate()}
              className="text-xs border border-accent text-accent rounded px-2 py-1 hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runNowMut.isPending ? 'Disparando...' : 'Disparar todos agora'}
            </button>
            <button type="button" onClick={() => refetchPreview()} className="text-xs text-accent hover:underline">
              {previewFetching ? '' : 'recalcular'}
            </button>
          </div>
        </div>
        {previewFetching ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !previewData?.items?.length ? (
          <div className="text-center py-8">
            <p className="text-sm text-fg-3">Nenhum produto com score &ge; {threshold} no momento.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Produto</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Canal</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {previewData.items.map((item, i) => (
                <tr key={i} className={`border-b border-border last:border-0 ${item.already_sent ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="space-y-0.5">
                      <p className="text-sm text-fg truncate max-w-[180px]">{item.product_name}</p>
                      <HoverPreview productId={item.product_id} channelId={item.channel_id} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-fg">{item.channel_name}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-sm font-semibold ${item.score >= 70 ? 'text-success' : item.score >= 50 ? 'text-warning' : 'text-fg-2'}`}>
                      {item.score.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {item.already_sent
                      ? <span className="text-xs text-fg-3">enviado nas ultimas 6h</span>
                      : <span className="text-xs text-accent font-medium">sera enviado</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      disabled={item.already_sent || dispatchOneMut.isPending}
                      onClick={() => dispatchOneMut.mutate({ product_id: item.product_id, channel_id: item.channel_id })}
                      className="text-xs border border-fg-3 text-fg-2 rounded px-2 py-0.5 hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Disparar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Log de posts auto matched */}
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Ultimos disparos automaticos</p>
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
            <p className="text-sm text-fg-2">Nenhum disparo automatico ainda.</p>
            <p className="text-xs text-fg-3">Ative o Auto Match acima para comecar.</p>
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
                      ver disparo &rarr;
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
