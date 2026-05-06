import { useState } from 'react'
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
          ? 'Nenhum grupo adicionado. Clique em + Adicionar grupo para vincular grupos do WhatsApp ou Telegram.'
          : 'Nenhum grupo encontrado com esse filtro.'}
      </p>
    )
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
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

  // Create WA group — kept from original, uses first connected account
  const [showCreateWA, setShowCreateWA] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', accountId: '' })

  const createMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/accounts/wa/${createForm.accountId}/groups`, { name: createForm.name })
        .then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setShowCreateWA(false)
      setCreateForm({ name: '', accountId: '' })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro ao criar grupo'
      alert(msg)
    },
  })

  const openCreate = () => {
    const first = activeWA[0]
    setCreateForm({ name: '', accountId: first ? String(first.id) : '' })
    setShowCreateWA(true)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-fg">Grupos</h1>
          <p className="text-sm text-fg-3 mt-0.5">
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
        <Button variant="primary" size="sm" disabled={activeWA.length === 0} onClick={openCreate}>
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
        </>
      )}

      {/* Create WA group modal */}
      {showCreateWA && activeWA.length > 0 && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => setShowCreateWA(false)}
        >
          <div
            className="bg-surface border border-border rounded-lg p-5 w-full max-w-sm shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-medium text-fg mb-4">Criar grupo WhatsApp</h3>
            <div className="space-y-3">
              <input
                autoFocus
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                placeholder="Nome do grupo..."
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
              />
              {activeWA.length > 1 && (
                <select
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                  value={createForm.accountId}
                  onChange={e => setCreateForm(f => ({ ...f, accountId: e.target.value }))}
                >
                  {activeWA.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" size="sm" onClick={() => setShowCreateWA(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={createMut.isPending}
                disabled={!createForm.name.trim()}
                onClick={() => createMut.mutate()}
              >
                Criar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
