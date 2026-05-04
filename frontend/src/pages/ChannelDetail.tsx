import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge, Tabs, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'audience', label: 'Audiência' },
  { id: 'groups', label: 'Grupos' },
  { id: 'history', label: 'Histórico' },
]

export default function ChannelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = React.useState('overview')

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channels', id],
    queryFn: () => apiClient.get(`/api/channels/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: metrics } = useQuery({
    queryKey: ['channels', id, 'metrics'],
    queryFn: () => apiClient.get(`/api/channels/${id}/metrics?period=30d`).then(r => r.data).catch(() => ({})),
    enabled: !!id,
  })

  const { data: audience } = useQuery({
    queryKey: ['channels', id, 'audience'],
    queryFn: () => apiClient.get(`/api/channels/${id}/audience`).then(r => r.data).catch(() => ({})),
    enabled: tab === 'audience' && !!id,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', { channelId: id }],
    queryFn: () => apiClient.get(`/api/groups?channelId=${id}`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    enabled: tab === 'groups' && !!id,
  })

  if (isLoading) return <div className="p-6"><Skeleton className="h-48 w-full" /></div>
  if (!channel) return <div className="p-6 text-fg-2">Canal não encontrado</div>

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/channels')} className="text-fg-3 hover:text-fg text-sm">← Canais</button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-fg">{channel.name}</h1>
            {channel.description && <p className="text-sm text-fg-2">{channel.description}</p>}
          </div>
          <Badge variant={channel.active ? 'success' : 'default'}>{channel.active ? 'ativo' : 'inativo'}</Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-6" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Membros" value={metrics?.member_count ?? channel.member_count ?? 0} />
            <KpiCard label="CTR 30d" value={metrics?.ctr ? `${(metrics.ctr * 100).toFixed(1)}%` : '—'} />
            <KpiCard label="CVR 30d" value={metrics?.cvr ? `${(metrics.cvr * 100).toFixed(1)}%` : '—'} />
            <KpiCard label="Receita 30d" value={metrics?.revenue ? `R$ ${Number(metrics.revenue).toFixed(0)}` : '—'} />
          </div>
        )}

        {tab === 'audience' && (
          <div className="bg-surface border border-border rounded-md p-4 max-w-lg">
            <h3 className="text-sm font-medium text-fg mb-3">Perfil de audiência</h3>
            {audience && (
              <div className="space-y-3 text-sm">
                <div><span className="text-fg-2 w-32 inline-block">Categorias:</span> <span className="text-fg">{(audience.categories ?? []).join(', ') || '—'}</span></div>
                <div><span className="text-fg-2 w-32 inline-block">Marcas:</span> <span className="text-fg">{(audience.brands ?? []).join(', ') || '—'}</span></div>
                <div><span className="text-fg-2 w-32 inline-block">Drop mínimo:</span> <span className="text-fg">{audience.min_drop ? `${audience.min_drop}%` : '—'}</span></div>
                <div><span className="text-fg-2 w-32 inline-block">Faixa preço:</span> <span className="text-fg">{audience.min_price || audience.max_price ? `R$ ${audience.min_price ?? 0} – R$ ${audience.max_price ?? '∞'}` : '—'}</span></div>
                <div><span className="text-fg-2 w-32 inline-block">Gênero:</span> <span className="text-fg">{audience.gender ?? '—'}</span></div>
              </div>
            )}
          </div>
        )}

        {tab === 'groups' && (
          <div className="space-y-2">
            {groups.length === 0 ? (
              <p className="text-sm text-fg-3">Nenhum grupo vinculado a este canal.</p>
            ) : groups.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-md">
                <div>
                  <p className="text-sm font-medium text-fg">{g.name}</p>
                  <p className="text-xs text-fg-3">{g.platform} · {g.member_count} membros</p>
                </div>
                <Badge variant={g.status === 'active' ? 'success' : 'warning'}>{g.status}</Badge>
              </div>
            ))}
          </div>
        )}

        {tab === 'history' && (
          <p className="text-sm text-fg-3">Histórico de disparos será exibido aqui.</p>
        )}
      </div>
    </div>
  )
}
