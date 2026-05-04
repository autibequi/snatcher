import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Tabs, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

const TABS = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'members', label: 'Membros' },
]

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = React.useState('overview')

  const { data: group, isLoading } = useQuery({
    queryKey: ['groups', id],
    queryFn: () => apiClient.get(`/api/groups/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['groups', id, 'members'],
    queryFn: () =>
      apiClient
        .get(`/api/groups/${id}/members`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    enabled: tab === 'members' && !!id,
  })

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!group) {
    return <div className="p-6 text-fg-2">Grupo nao encontrado</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <button
          onClick={() => navigate('/groups')}
          className="text-xs text-fg-3 hover:text-fg mb-2 block"
        >
          &larr; Grupos
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-fg">{group.name}</h1>
          <div className="flex gap-2">
            <Badge>{group.platform}</Badge>
            <Badge variant={group.status === 'active' ? 'success' : 'warning'}>
              {group.status}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-fg-2 mt-1">{group.member_count} membros</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-6" />

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="bg-surface border border-border rounded-md p-3">
              <p className="text-xs text-fg-3">Membros</p>
              <p className="text-lg font-semibold text-fg">{group.member_count}</p>
            </div>
            <div className="bg-surface border border-border rounded-md p-3">
              <p className="text-xs text-fg-3">Status</p>
              <p className="text-sm font-medium text-fg capitalize">{group.status}</p>
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div>
            {members.length === 0 ? (
              <p className="text-sm text-fg-3">Nenhum membro registrado.</p>
            ) : (
              <div className="space-y-1">
                {members.slice(0, 50).map((m: any, i: number) => (
                  <div
                    key={m.id ?? i}
                    className="flex items-center gap-3 p-2 text-sm text-fg-2"
                  >
                    <span className="w-6 text-fg-3 text-xs">{i + 1}</span>
                    <span>{m.name ?? m.jid ?? m.id ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
