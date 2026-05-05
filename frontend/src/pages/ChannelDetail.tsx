import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge, Button, Tabs, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Componente: lista grupos WA de uma conta para seleção ─────────────────────
function AccountGroupsPicker({
  account,
  search,
  alreadyAdded,
  onAdd,
  loading,
}: {
  account: { id: number; name: string }
  search: string
  alreadyAdded: string[]
  onAdd: (g: { id: string; name: string }) => void
  loading: boolean
}) {
  const { data: waGroups = [], isLoading } = useQuery({
    queryKey: ['wa-groups', account.id],
    queryFn: () => apiClient.get(`/api/accounts/wa/${account.id}/groups`).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 30_000,
  })

  const filtered = search
    ? waGroups.filter((g: any) => g.name?.toLowerCase().includes(search.toLowerCase()))
    : waGroups

  return (
    <div>
      <div className="px-5 py-2 bg-surface-2 border-b border-border">
        <p className="text-xs font-medium text-fg-2">{account.name}</p>
      </div>
      {isLoading ? (
        <div className="px-5 py-3 text-xs text-fg-3">Carregando grupos...</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-3 text-xs text-fg-3">
          {waGroups.length === 0 ? 'Sem grupos (aguarde sync)' : 'Nenhum grupo encontrado'}
        </div>
      ) : (
        filtered.map((g: any) => {
          const added = alreadyAdded.includes(g.id)
          return (
            <div key={g.id} className="flex items-center justify-between px-5 py-2.5 border-b border-border last:border-0 hover:bg-surface-2">
              <div>
                <p className="text-sm text-fg">{g.name || '(sem nome)'}</p>
                {g.size > 0 && <p className="text-xs text-fg-3">{g.size.toLocaleString('pt-BR')} membros</p>}
              </div>
              {added ? (
                <Badge variant="success" size="sm">já adicionado</Badge>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onAdd(g)}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                >
                  + Adicionar
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

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
  const [showEdit, setShowEdit] = React.useState(false)
  const [editForm, setEditForm] = React.useState({ name: '', description: '', active: true })

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

  const qc = useQueryClient()

  // Pré-popular form de edição quando canal carrega
  React.useEffect(() => {
    if (channel) setEditForm({ name: channel.name ?? '', description: channel.description ?? '', active: channel.active ?? true })
  }, [channel])

  const updateMut = useMutation({
    mutationFn: () => apiClient.put(`/api/channels/${id}`, {
      ...channel,
      name: editForm.name,
      description: editForm.description,
      active: editForm.active,
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels', id] }); qc.invalidateQueries({ queryKey: ['channels'] }); setShowEdit(false) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/channels/${id}`),
    onSuccess: () => navigate('/channels'),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao excluir'),
  })
  const [showAddGroup, setShowAddGroup] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', { channelId: id }],
    queryFn: () => apiClient.get(`/api/groups?channelId=${id}`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    enabled: tab === 'groups' && !!id,
  })

  // Buscar contas WA e seus grupos reais (para o modal de adicionar)
  const { data: waAccounts = [] } = useQuery({
    queryKey: ['accounts', 'wa'],
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => Array.isArray(r.data) ? r.data : []),
    enabled: showAddGroup,
  })

  // Para cada conta conectada, buscar grupos WA reais
  const connectedAccounts = waAccounts.filter((a: any) => a.active)

  const addGroupMut = useMutation({
    mutationFn: (g: { name: string; jid: string; accountId: number }) =>
      apiClient.post('/api/groups', {
        channel_id: Number(id),
        name: g.name,
        platform: 'whatsapp',
        jid: g.jid,
        account_id: g.accountId,
        status: 'active',
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] })
      setShowAddGroup(false)
      setSearch('')
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao adicionar grupo'),
  })

  const removeGroupMut = useMutation({
    mutationFn: (groupId: number) => apiClient.delete(`/api/groups/${groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] }),
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
          <div className="flex items-center gap-2">
            <Badge variant={channel.active ? 'success' : 'default'}>{channel.active ? 'ativo' : 'inativo'}</Badge>
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>Editar</Button>
            <Button variant="danger" size="sm" loading={deleteMut.isPending}
              onClick={() => { if (confirm(`Excluir canal "${channel.name}"? Esta ação é irreversível.`)) deleteMut.mutate() }}>
              Excluir
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de edição */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-fg mb-4">Editar canal</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-fg-2 block mb-1">Nome *</label>
                <input className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                  value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-fg-2 block mb-1">Descrição</label>
                <textarea rows={3} className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent resize-none"
                  value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editForm.active} onChange={e => setEditForm(f => ({...f, active: e.target.checked}))} className="accent-accent" />
                <span className="text-sm text-fg">Canal ativo</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" size="sm" onClick={() => setShowEdit(false)}>Cancelar</Button>
              <Button variant="primary" size="sm" loading={updateMut.isPending} disabled={!editForm.name.trim()} onClick={() => updateMut.mutate()}>Salvar</Button>
            </div>
          </div>
        </div>
      )}

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
          <div>
            {/* Header da tab */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-fg-2">{groups.length} grupo{groups.length !== 1 ? 's' : ''} vinculado{groups.length !== 1 ? 's' : ''}</p>
              <Button variant="primary" size="sm" onClick={() => setShowAddGroup(true)}>
                + Adicionar grupo
              </Button>
            </div>

            {/* Modal — lista de grupos WA reais */}
            {showAddGroup && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowAddGroup(false); setSearch('') }}>
                <div className="bg-surface border border-border rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col shadow-modal" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-medium text-fg">Selecionar grupo WhatsApp</h3>
                    <button type="button" onClick={() => setShowAddGroup(false)} className="text-fg-3 hover:text-fg text-lg leading-none">×</button>
                  </div>

                  {/* Busca */}
                  <div className="px-5 py-3 border-b border-border">
                    <input
                      autoFocus
                      className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                      placeholder="Buscar grupo..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>

                  {/* Lista de grupos por conta */}
                  <div className="flex-1 overflow-y-auto">
                    {connectedAccounts.length === 0 ? (
                      <div className="p-6 text-sm text-fg-3 text-center">
                        Nenhuma conta WhatsApp conectada.<br/>
                        Conecte uma conta em <a href="/accounts" className="text-accent hover:underline">Contas conectadas</a>.
                      </div>
                    ) : (
                      connectedAccounts.map((account: any) => (
                        <AccountGroupsPicker
                          key={account.id}
                          account={account}
                          search={search}
                          alreadyAdded={groups.map((g: any) => g.jid).filter(Boolean)}
                          onAdd={(g) => addGroupMut.mutate({ name: g.name, jid: g.id, accountId: account.id })}
                          loading={addGroupMut.isPending}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tabela */}
            {groups.length === 0 ? (
              <p className="text-sm text-fg-3 py-4">Nenhum grupo vinculado. Clique em "+ Adicionar grupo" para associar.</p>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border">
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Nome</th>
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Plataforma</th>
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                      <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Membros</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g: any) => (
                      <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-2.5 font-medium text-fg">{g.name}</td>
                        <td className="px-4 py-2.5 text-fg-2">{g.platform}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={g.status === 'active' ? 'success' : 'warning'} size="sm">{g.status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-fg-2">{g.member_count ?? 0}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            className="text-xs text-danger hover:underline"
                            onClick={() => { if (confirm(`Remover "${g.name}" deste canal?`)) removeGroupMut.mutate(g.id) }}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <p className="text-sm text-fg-3">Histórico de disparos será exibido aqui.</p>
        )}
      </div>
    </div>
  )
}
