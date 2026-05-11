import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { tableContainer, tableHeaderCell, tableRow, tableCell } from '../../lib/uiTokens'

/** Garante URL https://chat.whatsapp.com/… (só código, URL sem scheme, etc.) */
function normalizeWhatsAppInvite(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const low = s.toLowerCase()
  if (low.startsWith('http://') || low.startsWith('https://')) return s
  if (low.startsWith('//')) return `https:${s}`
  const marker = 'chat.whatsapp.com/'
  const i = low.indexOf(marker)
  if (i >= 0) {
    let rest = s.slice(i + marker.length).trim()
    rest = rest.replace(/^invite\//, '').replace(/^c\//, '')
    const q = rest.indexOf('?')
    if (q >= 0) rest = rest.slice(0, q)
    if (rest) return `https://chat.whatsapp.com/${rest}`
  }
  const tokenOk = /^[\w-]{10,512}$/.test(s) && !s.includes('/') && !s.includes(':') && !/\s/.test(s)
  return tokenOk ? `https://chat.whatsapp.com/${s}` : s
}

function waInviteHref(link: string | null | undefined): string | null {
  if (!link?.trim()) return null
  return normalizeWhatsAppInvite(link)
}

function normRegistryPlat(p: string | undefined) {
  const x = String(p ?? '').toLowerCase()
  return x === 'telegram' || x === 'tg' ? 'telegram' : 'whatsapp'
}

function dedupeRegistryByPhysicalJid<T extends { id?: number; jid?: string; platform?: string }>(rows: T[]): T[] {
  const by = new Map<string, T>()
  for (const g of rows) {
    const jid = String(g.jid ?? '').trim().toLowerCase()
    const key = jid ? `${normRegistryPlat(g.platform)}:${jid}` : `id:${g.id}`
    const prev = by.get(key)
    if (!prev) {
      by.set(key, g)
      continue
    }
    if (Number(g.id) < Number(prev.id)) by.set(key, g)
  }
  return Array.from(by.values())
}

function groupRowChannelId(row: any): number | null {
  const v = row?.channel_id
  if (v == null || v === '') return null
  if (typeof v === 'object' && v !== null && 'Int64' in v) {
    const n = (v as { Int64?: number; Valid?: boolean }).Int64
    if ((v as { Valid?: boolean }).Valid === false) return null
    return typeof n === 'number' && n > 0 ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

interface GroupsTabProps {
  channelId: string
}

export function GroupsTab({ channelId }: GroupsTabProps) {
  const id = channelId
  const qc = useQueryClient()
  const [showAddGroup, setShowAddGroup] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [editingInviteLink, setEditingInviteLink] = React.useState<Record<number, string>>({})

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', { channelId: id }],
    queryFn: () => apiClient.get(`/api/groups?channelId=${encodeURIComponent(String(id))}`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    enabled: !!id,
  })

  const { data: registryGroups = [], isLoading: registryLoading } = useQuery({
    queryKey: ['groups', 'registry', 'all'],
    queryFn: () => apiClient.get('/api/groups').then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    enabled: showAddGroup && !!id,
    staleTime: 15_000,
  })

  const updateInviteLinkMut = useMutation({
    mutationFn: ({ groupId, link }: { groupId: number; link: string }) => {
      const list = (qc.getQueryData(['groups', { channelId: id }]) as any[]) ?? []
      const g = list.find((x: any) => x.id === groupId)
      const normalized =
        g?.platform === 'whatsapp' && link.trim() ? normalizeWhatsAppInvite(link) : link.trim()
      return apiClient.patch(`/api/groups/${groupId}`, { invite_link: normalized })
    },
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] })
      setEditingInviteLink(prev => { const n = { ...prev }; delete n[groupId]; return n })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar link'),
  })

  const fetchInviteMut = useMutation({
    mutationFn: (groupId: number) =>
      apiClient.post(`/api/groups/${groupId}/fetch-invite`).then(r => r.data as { invite_link?: string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao buscar link via WhatsApp'),
  })

  const linkGroupMut = useMutation({
    mutationFn: async (row: any) => {
      const chId = Number(id)
      const jidKey = String(row.jid ?? '').trim().toLowerCase()
      if (jidKey) {
        const jidDup = groups.some((x: any) => String(x.jid ?? '').trim().toLowerCase() === jidKey)
        if (jidDup) {
          throw new Error('Este grupo (mesmo JID) já está vinculado a este canal.')
        }
      }
      const currentCh = groupRowChannelId(row)
      if (currentCh != null && currentCh === chId) {
        throw new Error('Este grupo já está vinculado a este canal')
      }
      if (currentCh == null) {
        return apiClient.patch(`/api/groups/${row.id}`, { channel_id: chId }).then(r => r.data)
      }
      const plat = row.platform === 'telegram' || row.platform === 'tg' ? 'telegram' : 'whatsapp'
      const body: Record<string, unknown> = {
        channel_id: chId,
        name: row.name,
        platform: plat,
        status: row.status || 'active',
      }
      if (row.jid) body.jid = row.jid
      if (row.wa_account_id != null && row.wa_account_id !== '')
        body.wa_account_id = Number(row.wa_account_id)
      if (row.tg_account_id != null && row.tg_account_id !== '')
        body.tg_account_id = Number(row.tg_account_id)
      return apiClient.post('/api/groups', body).then(r => r.data)
    },
    onSuccess: async (data: any) => {
      await qc.invalidateQueries({ queryKey: ['groups'] })
      await qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] })
      setShowAddGroup(false)
      setSearch('')
      const gid = data?.id ?? data?.ID
      const plat = data?.platform === 'whatsapp' || data?.platform === 'wa'
      if (gid != null && plat && data?.jid) {
        try {
          await apiClient.post(`/api/groups/${gid}/fetch-invite`)
        } catch {
          /* Evolution indisponível — link manual na lista */
        }
      }
    },
    onError: (err: any) =>
      alert(String(err?.response?.data?.error ?? err?.message ?? 'Erro ao vincular grupo')),
  })

  const removeGroupMut = useMutation({
    mutationFn: (groupId: number) => apiClient.delete(`/api/groups/${groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] }),
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-fg-2">
          {groups.length} grupo{groups.length !== 1 ? 's' : ''} vinculado{groups.length !== 1 ? 's' : ''}
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowAddGroup(true)}>
          + Adicionar grupo
        </Button>
      </div>

      {/* Modal — vincular grupo */}
      {showAddGroup && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowAddGroup(false); setSearch('') }}
        >
          <div
            className="bg-surface border border-border rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-medium text-fg">Vincular grupo ao canal</h3>
                <p className="text-[11px] text-fg-3 mt-1 leading-snug">
                  Lista apenas grupos já cadastrados na página{' '}
                  <a href="/groups" className="text-accent hover:underline" onClick={e => e.stopPropagation()}>Grupos</a>.
                  Para incluir um grupo novo do WhatsApp, cadastre-o lá primeiro.
                  {' '}
                  Se o grupo já estiver ligado a outro canal, ao vincular aqui o sistema cria uma nova linha para este canal (mesmo grupo físico; pode haver mais de uma linha na página Grupos).
                </p>
              </div>
              <button type="button" onClick={() => setShowAddGroup(false)} className="text-fg-3 hover:text-fg text-lg leading-none shrink-0">×</button>
            </div>

            <div className="px-5 py-3 border-b border-border">
              <input
                autoFocus
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                placeholder="Buscar grupo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {registryLoading ? (
                <div className="px-5 py-6 text-xs text-fg-3 text-center">Carregando grupos cadastrados...</div>
              ) : (() => {
                const linkedIds = new Set(groups.map((g: any) => Number(g.id)))
                const linkedJids = new Set(
                  groups.map((g: any) => String(g.jid ?? '').trim().toLowerCase()).filter(Boolean),
                )
                const dedupedRegistry = dedupeRegistryByPhysicalJid(registryGroups)
                const available = dedupedRegistry.filter((g: any) => {
                  if (linkedIds.has(Number(g.id))) return false
                  const j = String(g.jid ?? '').trim().toLowerCase()
                  if (j && linkedJids.has(j)) return false
                  return true
                })
                const q = search.trim().toLowerCase()
                const filtered = q
                  ? available.filter((g: any) => {
                      const name = String(g.name ?? '').toLowerCase()
                      const ch = String(g.channel_name ?? '').toLowerCase()
                      const jid = String(g.jid ?? '').toLowerCase()
                      return name.includes(q) || ch.includes(q) || jid.includes(q)
                    })
                  : available
                if (registryGroups.length === 0) {
                  return (
                    <div className="p-6 text-sm text-fg-3 text-center space-y-2">
                      <p>Nenhum grupo cadastrado na plataforma ainda.</p>
                      <p>
                        <a href="/groups" className="text-accent hover:underline">Abrir página Grupos</a>
                        {' '}para adicionar grupos do WhatsApp ou Telegram.
                      </p>
                    </div>
                  )
                }
                if (available.length === 0) {
                  return (
                    <div className="px-5 py-6 text-sm text-fg-3 text-center">
                      Todos os grupos cadastrados já estão vinculados a este canal.
                    </div>
                  )
                }
                if (filtered.length === 0) {
                  return <div className="px-5 py-6 text-xs text-fg-3 text-center">Nenhum grupo encontrado para esta busca.</div>
                }
                return filtered.map((g: any) => {
                  const ch = groupRowChannelId(g)
                  const plat = g.platform === 'telegram' || g.platform === 'tg' ? 'Telegram' : 'WhatsApp'
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between px-5 py-2.5 border-b border-border last:border-0 hover:bg-surface-2 gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg truncate">{g.name || '(sem nome)'}</p>
                        <p className="text-[10px] text-fg-3 mt-0.5">
                          {plat}
                          {g.channel_name ? (
                            <> · canal: <span className="text-fg-2">{g.channel_name}</span></>
                          ) : ch == null ? (
                            <> · <span className="text-warning">sem canal</span></>
                          ) : null}
                          {(g.member_count ?? g.size) > 0 && (
                            <> · {(g.member_count ?? g.size).toLocaleString('pt-BR')} membros</>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={linkGroupMut.isPending}
                        onClick={() => linkGroupMut.mutate(g)}
                        className="text-xs text-accent hover:underline disabled:opacity-50 shrink-0"
                      >
                        + Vincular
                      </button>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Tabela de grupos vinculados */}
      {groups.length === 0 ? (
        <p className="text-sm text-fg-3 py-4">Nenhum grupo vinculado. Clique em "+ Adicionar grupo" para associar.</p>
      ) : (
        <div className={tableContainer}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className={tableHeaderCell}>Nome</th>
                <th className={tableHeaderCell}>Plataforma</th>
                <th className={tableHeaderCell}>Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-fg-3">Membros</th>
                <th className={tableHeaderCell}>Link de convite</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g: any) => (
                <tr key={g.id} className={tableRow}>
                  <td className={`${tableCell} font-medium`}>{g.name}</td>
                  <td className="px-4 py-2.5 text-sm text-fg-2">{g.platform}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={g.status === 'active' ? 'success' : 'warning'} size="sm">{g.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-fg-2">{g.member_count ?? 0}</td>
                  <td className="px-4 py-2.5 min-w-[200px]">
                    {editingInviteLink[g.id] !== undefined ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="url"
                          placeholder="https://chat.whatsapp.com/..."
                          value={editingInviteLink[g.id]}
                          onChange={e => setEditingInviteLink(prev => ({ ...prev, [g.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateInviteLinkMut.mutate({ groupId: g.id, link: editingInviteLink[g.id] })
                            if (e.key === 'Escape') setEditingInviteLink(prev => { const n = { ...prev }; delete n[g.id]; return n })
                          }}
                          className="flex-1 text-xs border border-accent rounded px-2 py-1 bg-surface text-fg outline-none min-w-0"
                        />
                        <button type="button"
                          onClick={() => updateInviteLinkMut.mutate({ groupId: g.id, link: editingInviteLink[g.id] })}
                          className="text-xs text-success hover:underline whitespace-nowrap">✓</button>
                        <button type="button"
                          onClick={() => setEditingInviteLink(prev => { const n = { ...prev }; delete n[g.id]; return n })}
                          className="text-xs text-fg-3 hover:text-fg">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0 max-w-[280px]">
                        {g.platform === 'whatsapp' && waInviteHref(g.invite_link) ? (
                          <a
                            href={waInviteHref(g.invite_link)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent font-mono truncate hover:underline min-w-0 flex-1"
                            title="Abrir convite no WhatsApp"
                          >
                            {waInviteHref(g.invite_link)}
                          </a>
                        ) : g.invite_link ? (
                          <a
                            href={g.invite_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent font-mono truncate hover:underline min-w-0 flex-1"
                          >
                            {g.invite_link}
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingInviteLink(prev => ({ ...prev, [g.id]: '' }))}
                            className="text-xs text-fg-3 italic hover:text-fg text-left flex-1 min-w-0"
                          >
                            + definir link
                          </button>
                        )}
                        {Boolean(String(g.invite_link ?? '').trim()) && (
                          <button
                            type="button"
                            onClick={() => setEditingInviteLink(prev => ({ ...prev, [g.id]: g.invite_link ?? '' }))}
                            className="text-[10px] text-fg-3 hover:text-fg shrink-0"
                            title="Editar link"
                          >
                            ✎
                          </button>
                        )}
                        {g.platform === 'whatsapp' && g.jid && (
                          <button type="button"
                            onClick={() => fetchInviteMut.mutate(g.id)}
                            disabled={fetchInviteMut.isPending && fetchInviteMut.variables === g.id}
                            title="Buscar link de convite via WhatsApp"
                            className="text-xs text-accent hover:underline disabled:opacity-50 whitespace-nowrap">
                            {fetchInviteMut.isPending && fetchInviteMut.variables === g.id ? '...' : 'WA'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
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
  )
}
