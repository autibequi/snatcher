import { useQuery } from '@tanstack/react-query'
import { authFetch } from '../../lib/authFetch'
import { DataTable } from '../../components/ui'
import type { ColumnDef } from '@tanstack/react-table'

interface OutboxEvent {
  id: number
  aggregate_id: string
  event_type: string
  created_at: string
  processed_at?: string
  attempts: number
  last_error?: string
}

const COLUMNS: ColumnDef<OutboxEvent, unknown>[] = [
  {
    accessorKey: 'created_at',
    header: 'Criado',
    cell: ({ getValue }) => getValue<string>().slice(0, 19).replace('T', ' '),
  },
  { accessorKey: 'event_type', header: 'Tipo' },
  { accessorKey: 'aggregate_id', header: 'Aggregate ID' },
  { accessorKey: 'attempts', header: 'Tentativas' },
  {
    accessorKey: 'processed_at',
    header: 'Processado',
    cell: ({ row }) =>
      row.original.processed_at
        ? <span className="text-green-400">✓ {row.original.processed_at.slice(0, 19).replace('T', ' ')}</span>
        : row.original.last_error
          ? <span className="text-red-400" title={row.original.last_error}>⚠ erro</span>
          : <span className="text-orange-400">⏳ pendente</span>,
  },
]

export function OutboxEventsTab() {
  const { data = [], isLoading } = useQuery<OutboxEvent[]>({
    queryKey: ['outbox-events'],
    queryFn: async () => {
      const r = await authFetch('/api/admin/outbox-events?limit=100')
      if (!r.ok) return []
      return r.json()
    },
    refetchInterval: 15_000,
  })

  if (isLoading) return <div className="text-fg-3 py-8 text-center">Carregando outbox…</div>
  if (data.length === 0) return (
    <div className="text-fg-3 py-12 text-center">
      <p className="text-2xl mb-2">📭</p>
      <p>Outbox vazio — nenhum evento pendente.</p>
    </div>
  )

  const pending = data.filter(e => !e.processed_at).length
  return (
    <div>
      {pending > 0 && (
        <div className="mb-3 px-3 py-2 bg-orange-900/20 border border-orange-700/40 rounded text-orange-400 text-sm">
          ⏳ {pending} evento{pending > 1 ? 's' : ''} pendente{pending > 1 ? 's' : ''} de processamento
        </div>
      )}
      <DataTable columns={COLUMNS} data={data} />
    </div>
  )
}
