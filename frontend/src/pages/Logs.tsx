import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Badge, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

interface Dispatch {
  id: number
  short_id?: string
  status: string
  composed_by?: string
  message?: { text?: string }
  target_count?: number
  delivered_count?: number
  created_at: string
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  queued: 'warning',
  sending: 'warning',
  failed: 'danger',
  draft: 'default',
}

function DispatchDrawer({
  dispatch,
  onClose,
}: {
  dispatch: Dispatch
  onClose: () => void
}) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="Fechar painel"
      />
      {/* Drawer */}
      <div className="w-full max-w-md bg-surface border-l border-border h-full overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            Disparo {dispatch.short_id ?? `#${dispatch.id}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-3 hover:text-fg text-lg leading-none"
            aria-label="Fechar"
          >
            x
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[dispatch.status] ?? 'default'}>
            {dispatch.status}
          </Badge>
          <span className="text-xs text-fg-3">
            {new Date(dispatch.created_at).toLocaleString('pt-BR')}
          </span>
        </div>

        {dispatch.composed_by && (
          <div>
            <p className="text-xs text-fg-3 mb-1">Criado por</p>
            <p className="text-sm text-fg">{dispatch.composed_by}</p>
          </div>
        )}

        {dispatch.target_count != null && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Destinos</p>
              <p className="text-lg font-semibold text-fg">{dispatch.target_count}</p>
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Entregues</p>
              <p className="text-lg font-semibold text-fg">
                {dispatch.delivered_count ?? 0}
              </p>
            </div>
          </div>
        )}

        {dispatch.message?.text && (
          <div>
            <p className="text-xs text-fg-3 mb-1">Mensagem</p>
            <pre className="text-sm text-fg bg-surface-2 rounded-md p-3 whitespace-pre-wrap break-words font-sans">
              {dispatch.message.text}
            </pre>
          </div>
        )}

        <div>
          <p className="text-xs text-fg-3 mb-1">Payload</p>
          <pre className="text-xs text-fg-2 bg-surface-2 rounded-md p-3 overflow-x-auto">
            {JSON.stringify(dispatch, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default function Logs() {
  const [params] = useSearchParams()
  const statusFilter = params.get('status') ?? ''
  const [status, setStatus] = React.useState(statusFilter)
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [items, setItems] = React.useState<Dispatch[]>([])
  const [selected, setSelected] = React.useState<Dispatch | null>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-filter'],
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  const { isLoading } = useQuery<Dispatch[]>({
    queryKey: ['dispatches', status, dateFrom, dateTo, accountId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (accountId) params.set('account_id', accountId)
      return apiClient
        .get(`/api/dispatches${params.toString() ? '?' + params : ''}`)
        .then((r) => {
          const data = Array.isArray(r.data) ? r.data : []
          setItems(data)
          return data
        })
    },
    refetchInterval: 30_000,
  })

  // WS: atualizar dispatch status em tempo real
  useWSEvent('dispatch.target_updated', (data) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === data.dispatchId ? { ...d, status: 'sending' } : d
      )
    )
    setSelected((prev) =>
      prev?.id === data.dispatchId ? { ...prev, status: 'sending' } : prev
    )
  })

  useWSEvent('dispatch.completed', (data) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === data.dispatchId ? { ...d, status: 'completed' } : d
      )
    )
    setSelected((prev) =>
      prev?.id === data.dispatchId ? { ...prev, status: 'completed' } : prev
    )
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-fg mb-6">Logs de disparo</h1>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-2">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
          >
            <option value="">Todos</option>
            <option value="queued">Agendado</option>
            <option value="sending">Enviando</option>
            <option value="completed">Concluído</option>
            <option value="failed">Falhou</option>
            <option value="draft">Rascunho</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-2">De</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-2">Até</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg" />
        </div>
        {accounts.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fg-2">Conta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg">
              <option value="">Todas</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setAccountId(''); setStatus('') }}
          className="text-xs text-fg-3 hover:text-fg self-end pb-1.5">Limpar</button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum disparo ainda"
          description="Crie um disparo no Composer para ver os logs aqui."
        />
      ) : (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-fg-2 font-medium">ID</th>
                <th className="text-left p-3 text-fg-2 font-medium">Origem</th>
                <th className="text-left p-3 text-fg-2 font-medium">Status</th>
                <th className="text-left p-3 text-fg-2 font-medium hidden sm:table-cell">
                  Destinos
                </th>
                <th className="text-left p-3 text-fg-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                  onClick={() => setSelected(d)}
                >
                  <td className="p-3 text-fg font-mono text-xs">
                    {d.short_id ?? d.id}
                  </td>
                  <td className="p-3 text-fg-2 text-xs truncate max-w-[160px]">
                    {d.composed_by ?? '—'}
                  </td>
                  <td className="p-3">
                    <Badge variant={statusVariant[d.status] ?? 'default'}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-fg-3 text-xs hidden sm:table-cell">
                    {d.target_count != null
                      ? `${d.delivered_count ?? 0}/${d.target_count}`
                      : '—'}
                  </td>
                  <td className="p-3 text-fg-3 text-xs whitespace-nowrap">
                    {new Date(d.created_at).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DispatchDrawer dispatch={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
