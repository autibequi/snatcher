import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface RedesignGroup {
  id: number
  name: string
  platform: string
  status: string
  member_count: number
  invite_link?: { String: string; Valid: boolean }
  channel_id: number
  created_at: string
  last_message_at?: { Time: string; Valid: boolean }
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  paused: 'warning',
  banned: 'danger',
  full: 'default',
}

export default function Groups() {
  const navigate = useNavigate()
  const [platform, setPlatform] = React.useState('')

  const { data: groups = [], isLoading } = useQuery<RedesignGroup[]>({
    queryKey: ['groups', platform],
    queryFn: () =>
      apiClient
        .get(`/api/groups${platform ? `?platform=${platform}` : ''}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Grupos</h1>
        <Button variant="primary" size="sm">+ Adicionar grupo</Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {['', 'whatsapp', 'telegram'].map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
              platform === p
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-fg-2 hover:bg-border'
            }`}
          >
            {p || 'Todos'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !groups.length ? (
        <EmptyState
          title="Nenhum grupo"
          description="Adicione grupos de WhatsApp ou Telegram para enviar promacoes."
          cta={{ label: 'Adicionar grupo', onClick: () => {} }}
        />
      ) : (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Nome', 'Plataforma', 'Status', 'Membros', 'Ultimo disparo'].map(h => (
                  <th key={h} className="text-left p-3 text-fg-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                >
                  <td className="p-3 font-medium text-fg">{g.name}</td>
                  <td className="p-3">
                    <Badge size="sm">{g.platform}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={statusVariant[g.status] ?? 'default'} size="sm">
                      {g.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-fg-2">{g.member_count}</td>
                  <td className="p-3 text-fg-3 text-xs">
                    {g.last_message_at?.Valid
                      ? new Date(g.last_message_at.Time).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
