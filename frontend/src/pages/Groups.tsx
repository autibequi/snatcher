import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, EmptyState, Skeleton, Input } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────

interface WAAccount {
  id: number
  name: string
  status: string
  active: boolean
}

interface TGAccount {
  id: number
  name: string
  bot_username?: string
  active: boolean
  role: string
}

interface Channel {
  id: number
  name: string
  active: boolean
}

interface WAGroupOption {
  id: string   // JID, ex: "123456@g.us"
  name: string
  size: number
}

/** Flat group row from /api/groups — some fields may be absent (backend enrichment in progress) */
interface GroupRow {
  id: string | number
  name: string
  platform: 'whatsapp' | 'telegram' | string
  // enriched fields — may be absent
  channel_name?: string
  account_label?: string
  member_count?: number
  size?: number
  admin_count?: number
  admins?: Array<{ initials: string; color?: string }>
  status?: string
  audience_status?: 'profile' | 'no_profile' | string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
]

function avatarColor(seed: string): string {
  let n = 0
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const isWA = platform === 'whatsapp' || platform === 'wa'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs font-medium border ${
      isWA
        ? 'border-success/30 text-success bg-success/10'
        : 'border-accent/30 text-accent bg-accent/10'
    }`}>
      {isWA ? '📱' : '✈️'} {isWA ? 'WA' : 'TG'}
    </span>
  )
}

function AdminAvatars({
  admins,
  adminCount,
}: {
  admins?: Array<{ initials: string; color?: string }>
  adminCount?: number
}) {
  const count = adminCount ?? admins?.length ?? 0
  const avatarList = admins ?? []
  const show = avatarList.slice(0, 3)
  const isRisky = count < 2

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1">
        {show.length > 0
          ? show.map((a, i) => (
              <span
                key={i}
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white ring-1 ring-surface ${
                  a.color ?? avatarColor(a.initials)
                }`}
              >
                {a.initials}
              </span>
            ))
          : null}
      </div>
      {count > 0 ? (
        <span className={`text-xs font-medium ${isRisky ? 'text-warning' : 'text-fg-2'}`}>
          {count > 0 ? `${Math.min(show.length || 1, count)} / ${count}` : '—'}
          {isRisky && (
            <span className="ml-1 text-warning text-[10px] font-bold">risco</span>
          )}
        </span>
      ) : (
        <span className="text-xs text-fg-3">—</span>
      )}
    </div>
  )
}

function StatusDot({ status }: { status?: string }) {
  const active = !status || status === 'active'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${active ? 'text-success' : 'text-fg-3'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success' : 'bg-fg-3'}`} />
      {active ? 'ativo' : (status ?? '—')}
    </span>
  )
}

function AudienceBadge({ audienceStatus }: { audienceStatus?: string }) {
  if (!audienceStatus) return <span className="text-xs text-fg-3">—</span>
  const hasProfile = audienceStatus === 'profile'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs font-medium border ${
      hasProfile
        ? 'border-success/30 text-success bg-success/10'
        : 'border-warning/30 text-warning bg-warning/10'
    }`}>
      {hasProfile ? '✓ perfil' : '⚠ sem perfil'}
    </span>
  )
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function AdminRiskBanner({ groups }: { groups: GroupRow[] }) {
  const risky = groups.filter(g => {
    const count = g.admin_count ?? g.admins?.length
    return count !== undefined && count < 2
  })
  if (risky.length === 0) return null
  return (
    <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-warning/10 border border-warning/30 rounded-md text-sm text-warning">
      <span className="mt-0.5 shrink-0">⚠</span>
      <span>
        <strong>{risky.length} grupo{risky.length !== 1 ? 's' : ''}</strong> com menos de 2 contas admin — risco de
        perda permanente
      </span>
    </div>
  )
}

// ── Flat groups table ─────────────────────────────────────────────────────────

function GroupsTable({
  groups,
  search,
  accountFilter,
  onRowClick,
}: {
  groups: GroupRow[]
  search: string
  accountFilter: string
  onRowClick: (id: string | number) => void
}) {
  const lower = search.toLowerCase()
  const filtered = groups.filter(g => {
    if (accountFilter && g.account_label !== accountFilter) return false
    if (!search) return true
    return (
      g.name?.toLowerCase().includes(lower) ||
      g.channel_name?.toLowerCase().includes(lower) ||
      g.account_label?.toLowerCase().includes(lower)
    )
  })

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-fg-3 py-4 text-center">
        {groups.length === 0
          ? 'Nenhum grupo cadastrado. Use "+ Adicionar grupo" para importar grupos da conta WA.'
          : 'Nenhum grupo encontrado com esse filtro.'}
      </p>
    )
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Grupo
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Plataforma
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Canal
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Conta
            </th>
            <th className="text-right px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Membros
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Admins
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Status
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
              Audiência
            </th>
            <th className="w-6 px-4" />
          </tr>
        </thead>
        <tbody>
          {filtered.map(g => {
            const memberCount = g.member_count ?? g.size
            return (
              <tr
                key={g.id}
                className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                onClick={() => onRowClick(g.id)}
              >
                <td className="px-4 py-2.5">
                  <p className="font-medium text-fg">{g.name || '(sem nome)'}</p>
                </td>
                <td className="px-4 py-2.5">
                  <PlatformBadge platform={g.platform} />
                </td>
                <td className="px-4 py-2.5 text-fg-2">
                  {g.channel_name ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-fg-2">
                  {g.account_label ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-fg-2">
                  {memberCount != null ? memberCount.toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <AdminAvatars admins={g.admins} adminCount={g.admin_count} />
                </td>
                <td className="px-4 py-2.5">
                  <StatusDot status={g.status} />
                </td>
                <td className="px-4 py-2.5">
                  <AudienceBadge audienceStatus={g.audience_status} />
                </td>
                <td className="px-4 py-2.5 text-fg-3 text-xs">›</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

// ── Available WA groups (Evolution) — não vinculados a canal ─────────────────

function AvailableWAGroupsSection({
  account,
  channels,
  linkedJIDs,
  onLinked,
}: {
  account: WAAccount
  channels: Channel[]
  linkedJIDs: Set<string>
  onLinked: () => void
}) {
  const { data: waGroups = [], isLoading, isFetching, refetch } = useQuery<WAGroupOption[]>({
    queryKey: ['available-wa-groups', account.id],
    queryFn: () =>
      apiClient
        .get(`/api/accounts/wa/${account.id}/groups`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    enabled: account.status === 'connected',
    // Long-polling adaptativo: enquanto vazio (Evolution ainda respondendo), 15s; com dados, 60s.
    refetchInterval: (q) => {
      const data = q.state.data as WAGroupOption[] | undefined
      return data && data.length > 0 ? 60_000 : 15_000
    },
  })

  const linkMut = useMutation({
    mutationFn: ({ jid, name, size, channelId }: { jid: string; name: string; size: number; channelId: number }) =>
      apiClient.post('/api/groups', {
        channel_id: channelId,
        name,
        platform: 'whatsapp',
        wa_account_id: account.id,
        jid,
        member_count: size,
      }),
    onSuccess: onLinked,
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao vincular'),
  })

  const [search, setSearch] = useState('')

  const unlinkedAll = waGroups.filter(g => !linkedJIDs.has(g.id))
  const q = search.trim().toLowerCase()
  const unlinked = q
    ? unlinkedAll.filter(g => g.name.toLowerCase().includes(q))
    : unlinkedAll

  if (account.status !== 'connected') return null

  // Mantém visível o estado "esperando Evolution" — antes desaparecia, dando impressão
  // de tela quebrada. Agora mostra placeholder com refresh manual.
  const empty = !isLoading && waGroups.length === 0

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
          Grupos no WhatsApp · {account.name}
          {isFetching && (
            <span className="text-[10px] text-fg-3 font-normal flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-accent rounded-full animate-pulse" />
              atualizando…
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-3">
            {unlinkedAll.length} disponíveis · {waGroups.length - unlinkedAll.length} vinculados
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs text-fg-3 hover:text-fg disabled:opacity-50"
            title="Forçar refresh da Evolution"
          >
            ↻
          </button>
        </div>
      </div>

      {empty ? (
        <div className="border border-border rounded-md p-4 text-center bg-surface-2">
          <p className="text-xs text-fg-3">Evolution ainda não retornou os grupos desta conta.</p>
          <p className="text-[10px] text-fg-3 mt-1">Auto-refresh a cada 15s. Pode levar até 1 min se a instância acabou de conectar.</p>
        </div>
      ) : isLoading ? (
        <p className="text-xs text-fg-3 py-2">Carregando…</p>
      ) : unlinkedAll.length === 0 ? (
        <p className="text-xs text-fg-3 py-2">Todos os grupos já foram vinculados.</p>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Filtrar entre ${unlinkedAll.length} grupos pelo nome…`}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent mb-2"
          />
          {unlinked.length === 0 ? (
            <p className="text-xs text-fg-3 py-2">Nenhum grupo bate com "{search}".</p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 border-b border-border">
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Nome</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase">Membros</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase w-72">Vincular a canal</th>
                  </tr>
                </thead>
                <tbody>
                  {unlinked.map(g => (
                    <UnlinkedRow
                      key={g.id}
                      group={g}
                      channels={channels}
                      onLink={(channelId) => linkMut.mutate({ jid: g.id, name: g.name, size: g.size, channelId })}
                      pending={linkMut.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UnlinkedRow({
  group,
  channels,
  onLink,
  pending,
}: {
  group: WAGroupOption
  channels: Channel[]
  onLink: (channelId: number) => void
  pending: boolean
}) {
  const [channelId, setChannelId] = useState<string>(channels[0] ? String(channels[0].id) : '')
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2/50">
      <td className="px-4 py-2 text-fg">{group.name}</td>
      <td className="px-4 py-2 text-right text-fg-2">{group.size}</td>
      <td className="px-4 py-2">
        <div className="flex gap-1">
          {channels.length === 0 ? (
            <span className="text-xs text-warning">Crie um canal primeiro</span>
          ) : (
            <>
              <select
                value={channelId}
                onChange={e => setChannelId(e.target.value)}
                className="text-xs border border-border rounded px-2 py-1 bg-surface text-fg flex-1"
              >
                {channels.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => channelId && onLink(Number(channelId))}
                disabled={pending || !channelId}
                className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Vincular
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Groups() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('')

  // Load all accounts (for stats and to show connected counts)
  const { data: waAccounts = [], isLoading: waLoading } = useQuery<WAAccount[]>({
    queryKey: ['accounts', 'wa'],
    queryFn: () =>
      apiClient.get('/api/accounts/wa').then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const { data: tgAccounts = [], isLoading: tgLoading } = useQuery<TGAccount[]>({
    queryKey: ['accounts', 'tg'],
    queryFn: () =>
      apiClient.get('/api/accounts/tg').then(r => (Array.isArray(r.data) ? r.data : [])),
  })

  // Flat groups list from /api/groups — backend may or may not return enriched fields
  const { data: groups = [], isLoading: groupsLoading } = useQuery<GroupRow[]>({
    queryKey: ['groups'],
    queryFn: () =>
      apiClient
        .get('/api/groups')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const qc = useQueryClient()

  const activeWA = waAccounts.filter(a => a.active)
  const connectedWA = waAccounts.filter(a => a.status === 'connected').length
  const activeTG = tgAccounts.filter(a => a.active)
  const isLoading = waLoading || tgLoading || groupsLoading

  // Channels — necessários para vincular um grupo ao importar
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => apiClient.get('/api/channels').then(r => (Array.isArray(r.data) ? r.data : [])),
  })
  const activeChannels = channels.filter(c => c.active)

  // ── Modal de importação de grupos WA ──────────────────────────────────────
  const [showImport, setShowImport] = useState(false)
  const [importAccountId, setImportAccountId] = useState('')
  const [importChannelId, setImportChannelId] = useState('')
  const [selectedJID, setSelectedJID] = useState('')
  const [importInviteLink, setImportInviteLink] = useState('')
  const [groupSearch, setGroupSearch] = useState('')

  // Busca grupos da Evolution API ao trocar de conta
  const { data: waGroupOptions = [], isFetching: waGroupsFetching, refetch: refetchWAGroups } =
    useQuery<WAGroupOption[]>({
      queryKey: ['wa-groups-evo', importAccountId],
      queryFn: () =>
        apiClient
          .get(`/api/accounts/wa/${importAccountId}/groups?fresh=true`)
          .then(r => (Array.isArray(r.data) ? r.data : [])),
      enabled: false, // dispara manualmente via refetch
    })

  useEffect(() => {
    setSelectedJID('')
    setGroupSearch('')
    if (importAccountId) refetchWAGroups()
  }, [importAccountId, refetchWAGroups])

  const openImport = () => {
    const first = activeWA[0]
    const firstCh = activeChannels[0]
    setImportAccountId(first ? String(first.id) : '')
    setImportChannelId(firstCh ? String(firstCh.id) : '')
    setSelectedJID('')
    setGroupSearch('')
    setShowImport(true)
  }

  const selectedGroup = waGroupOptions.find(g => g.id === selectedJID)

  const importMut = useMutation({
    mutationFn: () => {
      if (!selectedGroup) throw new Error('Selecione um grupo')
      if (!importChannelId) throw new Error('Selecione um canal')
      return apiClient
        .post('/api/groups', {
          channel_id: Number(importChannelId),
          name: selectedGroup.name,
          platform: 'whatsapp',
          wa_account_id: Number(importAccountId),
          jid: selectedGroup.id,
          member_count: selectedGroup.size,
          invite_link: importInviteLink.trim() || undefined,
        })
        .then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setShowImport(false)
      setImportInviteLink('')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro ao importar grupo'
      alert(msg)
    },
  })

  const filteredWAOptions = waGroupOptions.filter(g =>
    !groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-fg-3">
            Destinos físicos (WhatsApp/Telegram) vinculados a canais
          </p>
          {!isLoading && (
            <p className="text-xs text-fg-3 mt-0.5">
              {connectedWA} WA conectada{connectedWA !== 1 ? 's' : ''} · {activeTG.length} TG
              configurada{activeTG.length !== 1 ? 's' : ''} · {groups.length} grupo
              {groups.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button variant="primary" size="sm" disabled={activeWA.length === 0} onClick={openImport}>
          + Adicionar grupo
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : activeWA.length === 0 && activeTG.length === 0 ? (
        <EmptyState
          title="Nenhuma conta configurada"
          description="Conecte uma conta WhatsApp ou Telegram em Contas conectadas."
          cta={{ label: 'Ir para Contas', onClick: () => (window.location.href = '/accounts') }}
        />
      ) : (
        <>
          {/* Admin risk banner */}
          <AdminRiskBanner groups={groups} />

          {/* Filtros */}
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="w-64">
              <Input
                placeholder="Buscar grupo, canal, conta..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {(waAccounts.length > 0 || tgAccounts.length > 0) && (
              <select
                className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg h-9"
                value={accountFilter}
                onChange={e => setAccountFilter(e.target.value)}
              >
                <option value="">Todas as contas</option>
                {waAccounts.map(a => (
                  <option key={`wa-${a.id}`} value={a.name}>📱 {a.name}</option>
                ))}
                {tgAccounts.map(a => (
                  <option key={`tg-${a.id}`} value={a.name}>✈️ {a.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Flat table */}
          <GroupsTable
            groups={groups}
            search={search}
            accountFilter={accountFilter}
            onRowClick={id => navigate(`/groups/${id}`)}
          />

          {/* Grupos disponíveis no WhatsApp (não vinculados a canal) */}
          {activeWA.map(acc => (
            <AvailableWAGroupsSection
              key={acc.id}
              account={acc}
              channels={activeChannels}
              linkedJIDs={new Set(groups.map(g => String((g as any).jid ?? '')))}
              onLinked={() => qc.invalidateQueries({ queryKey: ['groups'] })}
            />
          ))}
        </>
      )}

      {/* Modal de importação de grupos WA */}
      {showImport && activeWA.length > 0 && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImport(false)}
        >
          <div
            className="bg-surface border border-border rounded-lg p-5 w-full max-w-md shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-medium text-fg mb-4">Importar grupo WhatsApp</h3>
            <div className="space-y-3">
              {/* Conta WA */}
              {activeWA.length > 1 && (
                <div>
                  <label className="text-xs text-fg-2 mb-1 block">Conta</label>
                  <select
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                    value={importAccountId}
                    onChange={e => setImportAccountId(e.target.value)}
                  >
                    {activeWA.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Canal destino */}
              <div>
                <label className="text-xs text-fg-2 mb-1 block">Canal</label>
                {activeChannels.length === 0 ? (
                  <p className="text-xs text-warning">
                    Nenhum canal ativo. Crie um canal antes de importar grupos.
                  </p>
                ) : (
                  <select
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                    value={importChannelId}
                    onChange={e => setImportChannelId(e.target.value)}
                  >
                    {activeChannels.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Lista de grupos da Evolution */}
              <div>
                <label className="text-xs text-fg-2 mb-1 block">Grupo</label>
                {waGroupsFetching ? (
                  <p className="text-xs text-fg-3 py-2">Buscando grupos da conta...</p>
                ) : waGroupOptions.length === 0 ? (
                  <p className="text-xs text-fg-3 py-2">
                    Nenhum grupo encontrado na conta. A conta precisa estar conectada.
                  </p>
                ) : (
                  <>
                    <input
                      className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent mb-2"
                      placeholder="Filtrar grupos..."
                      value={groupSearch}
                      onChange={e => setGroupSearch(e.target.value)}
                    />
                    <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
                      {filteredWAOptions.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-surface-2 transition-colors ${
                            selectedJID === g.id ? 'bg-accent/10 text-accent' : 'text-fg'
                          }`}
                          onClick={() => setSelectedJID(selectedJID === g.id ? '' : g.id)}
                        >
                          <span className="truncate">{g.name}</span>
                          <span className="text-xs text-fg-3 ml-2 shrink-0">{g.size} membros</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Invite link — obrigatório para o link público funcionar */}
            {selectedJID && (
              <div className="mt-3">
                <label className="text-xs text-fg-2 block mb-1">
                  Link de convite <span className="text-fg-3">(cole aqui para o Link Público funcionar)</span>
                </label>
                <input
                  type="url"
                  value={importInviteLink}
                  onChange={e => setImportInviteLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>
            )}

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" size="sm" onClick={() => setShowImport(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={importMut.isPending}
                disabled={!selectedJID || !importChannelId || activeChannels.length === 0}
                onClick={() => importMut.mutate()}
              >
                Importar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
