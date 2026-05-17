import { useQuery } from '@tanstack/react-query'
import { authFetch } from '../../lib/authFetch'
import { DataTable, EmptyState } from '../../components/ui'
import type { ColumnDef } from '@tanstack/react-table'
import { mythosEmpty, mythosTooltip } from '../../lib/copy/mythos'

interface QuarantineEvent {
  id: number
  subject_kind: string
  subject_id: number
  reason: string
  triggered_at: string
  quarantine_until?: string
  lifted_at?: string
  lifted_by?: string
}

const KIND_LABEL: Record<string, string> = {
  redirect_domain: '🌐 Domínio',
  account: '📱 Conta',
  channel: '📺 Canal',
  catalog_item: '📦 Produto',
}

const COLUMNS: ColumnDef<QuarantineEvent, unknown>[] = [
  {
    accessorKey: 'triggered_at',
    header: 'Quando',
    cell: ({ getValue }) => getValue<string>().slice(0, 19).replace('T', ' '),
  },
  {
    accessorKey: 'subject_kind',
    header: 'Tipo',
    cell: ({ getValue }) => KIND_LABEL[getValue<string>()] ?? getValue<string>(),
  },
  { accessorKey: 'subject_id', header: 'ID' },
  { accessorKey: 'reason', header: 'Motivo' },
  {
    accessorKey: 'quarantine_until',
    header: 'Até',
    cell: ({ getValue }) => getValue<string | null>()?.slice(0, 19).replace('T', ' ') ?? '—',
  },
  {
    accessorKey: 'lifted_at',
    header: 'Liberado',
    cell: ({ row }) =>
      row.original.lifted_at
        ? <span className="text-green-400">✓ {row.original.lifted_by ?? 'auto'}</span>
        : <span className="text-orange-400">⏳ ativo</span>,
  },
]

export function QuarantineEventsTab() {
  const { data = [], isLoading } = useQuery<QuarantineEvent[]>({
    queryKey: ['quarantine-events'],
    queryFn: async () => {
      const r = await authFetch('/api/admin/quarantine-events?limit=100')
      if (!r.ok) return []
      return r.json()
    },
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return <div className="text-fg-3 py-8 text-center">Carregando quarentenas…</div>
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Quarentena vazia"
        description={mythosEmpty.quarantine}
      />
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-3" title={mythosTooltip.quarantine}>
        {data.length} evento{data.length !== 1 ? 's' : ''} em quarentena
      </p>
      <DataTable columns={COLUMNS} data={data} />
    </div>
  )
}
