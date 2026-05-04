import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

interface Cluster {
  id: number
  label: string
  description?: string
  member_channels: number[]
  metrics: {
    ctr?: number
    cvr?: number
    avg_ticket?: number
  }
  top_categories: string[]
  top_brands: string[]
  computed_at: string
}

export default function Clusters() {
  const qc = useQueryClient()

  const { data: clusters = [], isLoading } = useQuery<Cluster[]>({
    queryKey: ['clusters'],
    queryFn: () => apiClient.get('/api/clusters').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  const recompute = useMutation({
    mutationFn: () => apiClient.post('/api/clusters/recompute').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clusters'] }),
  })

  // Invalidar clusters quando há novos produtos (clusters podem mudar)
  useWSEvent('product.new', () => {
    // re-fetch silencioso após novos produtos, sem forçar recompute
  })

  const exportCSV = () => {
    if (!clusters.length) return
    const rows = [
      ['Label', 'Descrição', 'Canais', 'CTR (%)', 'CVR (%)', 'Ticket Médio'],
      ...clusters.map(c => [
        c.label,
        c.description ?? '',
        String(c.member_channels?.length ?? 0),
        c.metrics.ctr ? (c.metrics.ctr * 100).toFixed(1) : '0',
        c.metrics.cvr ? (c.metrics.cvr * 100).toFixed(1) : '0',
        c.metrics.avg_ticket ? String(Math.round(c.metrics.avg_ticket)) : '0',
      ])
    ]
    const csv = '﻿' + rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clusters.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-fg">Clusters</h1>
          {clusters.length > 0 && clusters[0].computed_at && (
            <p className="text-xs text-fg-3">
              Última análise: {new Date(clusters[0].computed_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={exportCSV}
            disabled={clusters.length === 0}
          >
            Exportar CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            Recomputar clusters
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:3}).map((_,i) => <Skeleton key={i} variant="card" className="h-40" />)}
        </div>
      ) : !clusters.length ? (
        <EmptyState
          title="Nenhum cluster calculado"
          description="Clique em Recomputar para agrupar canais por comportamento de audiência."
          cta={{ label: 'Recomputar agora', onClick: () => recompute.mutate() }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map(c => (
            <div key={c.id} className="bg-surface border border-border rounded-md p-4">
              <p className="font-medium text-fg mb-1">{c.label}</p>
              {c.description && <p className="text-xs text-fg-3 mb-3">{c.description}</p>}
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div>
                  <p className="text-fg-3">CTR</p>
                  <p className="font-medium text-fg">{c.metrics.ctr ? `${(c.metrics.ctr*100).toFixed(1)}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-fg-3">CVR</p>
                  <p className="font-medium text-fg">{c.metrics.cvr ? `${(c.metrics.cvr*100).toFixed(1)}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-fg-3">Canais</p>
                  <p className="font-medium text-fg">{c.member_channels?.length ?? 0}</p>
                </div>
              </div>
              {c.top_categories?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {c.top_categories.slice(0,3).map(cat => (
                    <Badge key={cat} size="sm" variant="accent">{cat}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
