import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '../../lib/authFetch'
import { DataTable } from '../../components/ui'
import type { ColumnDef } from '@tanstack/react-table'

interface Rejection {
  id: number
  catalog_id: number
  channel_id?: number
  reason: string
  rejected_at: string
}

const COLUMNS: ColumnDef<Rejection, unknown>[] = [
  {
    accessorKey: 'rejected_at',
    header: 'Quando',
    cell: ({ getValue }) => getValue<string>().slice(0, 19).replace('T', ' '),
  },
  { accessorKey: 'catalog_id', header: 'Produto ID' },
  { accessorKey: 'channel_id', header: 'Canal ID', cell: ({ getValue }) => getValue<number | null>() ?? '—' },
  {
    accessorKey: 'reason',
    header: 'Motivo',
    cell: ({ getValue }) => {
      const r = getValue<string>()
      const colors: Record<string, string> = {
        no_original_price: 'text-orange-400',
        discount_below_min: 'text-yellow-400',
        duplicate_in_window: 'text-blue-400',
        channel_paused: 'text-gray-400',
        brand_missing: 'text-purple-400',
        catalog_not_ready: 'text-red-400',
      }
      return <span className={colors[r] ?? ''}>{r}</span>
    },
  },
]

export function DispatchRejectionsTab() {
  const [limit] = useState(100)

  const { data = [], isLoading } = useQuery<Rejection[]>({
    queryKey: ['dispatch-rejections', limit],
    queryFn: async () => {
      const r = await authFetch(`/api/admin/dispatch-rejections?limit=${limit}`)
      if (!r.ok) return []
      return r.json()
    },
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="text-fg-3 py-8 text-center">Carregando rejeições…</div>
  if (data.length === 0) return (
    <div className="text-fg-3 py-12 text-center">
      <p className="text-2xl mb-2">✅</p>
      <p>Nenhuma rejeição recente. O validador aprovou tudo — ou ainda não rodou.</p>
    </div>
  )

  return <DataTable columns={COLUMNS} data={data} />
}
