import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface Channel {
  id: number
  name: string
  description?: string
  active: boolean
  member_count?: number
  ctr_30d?: number
  cvr_30d?: number
  revenue_30d?: number
  audience?: {
    categories?: string[]
    min_drop?: number
  }
}

function ChannelCard({ channel, onClick }: { channel: Channel; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border rounded-md p-4 hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-medium text-fg">{channel.name}</p>
        <Badge variant={channel.active ? 'success' : 'default'}>
          {channel.active ? 'ativo' : 'inativo'}
        </Badge>
      </div>
      {channel.description && (
        <p className="text-xs text-fg-3 mb-3 line-clamp-2">{channel.description}</p>
      )}
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div>
          <p className="text-xs text-fg-3">Membros</p>
          <p className="text-sm font-medium text-fg">{channel.member_count ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-fg-3">CTR 30d</p>
          <p className="text-sm font-medium text-fg">{channel.ctr_30d ? `${(channel.ctr_30d * 100).toFixed(1)}%` : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-fg-3">Receita 30d</p>
          <p className="text-sm font-medium text-fg">{channel.revenue_30d ? `R$ ${channel.revenue_30d.toFixed(0)}` : '—'}</p>
        </div>
      </div>
      {channel.audience?.categories?.length ? (
        <div className="flex gap-1 flex-wrap mt-2">
          {channel.audience.categories.slice(0, 3).map(c => (
            <Badge key={c} size="sm" variant="accent">{c}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function Channels() {
  const navigate = useNavigate()

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => apiClient.get('/api/channels').then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Canais</h1>
        <Button variant="primary" size="sm">+ Novo canal</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:6}).map((_,i) => <Skeleton key={i} variant="card" className="h-36" />)}
        </div>
      ) : !channels.length ? (
        <EmptyState title="Nenhum canal" description="Crie um canal para definir o público das suas promoções." cta={{ label: 'Criar canal', onClick: () => {} }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map(ch => (
            <ChannelCard key={ch.id} channel={ch} onClick={() => navigate(`/channels/${ch.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
