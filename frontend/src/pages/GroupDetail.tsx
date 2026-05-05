import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GroupDetail {
  id: string | number
  name: string
  platform: string
  status?: string
  member_count?: number
  channel_name?: string
  channel_id?: number
  total_audience?: number
  last_sent_at?: string
  // KPI fields — may be absent (backend enrichment)
  active_members?: number
  dormant_members?: number
  clicks_30d?: number
  per_member_clicks?: number
}

interface AdminAccount {
  id: number
  name: string
  phone?: string
  platform?: string
  initials?: string
  color?: string
  protected_count?: number
  total_count?: number
}

interface GroupMember {
  id?: string | number
  jid?: string
  name?: string
  phone?: string
  joined_at?: string
  clicks_30d?: number
  last_click_at?: string
  role?: 'admin' | 'member' | string
  engagement?: 'engaged' | 'active' | 'dormant' | string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'há agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`
  return `há ${Math.floor(mo / 12)}a`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const isWA = platform === 'whatsapp' || platform === 'wa'
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs font-medium border ${
        isWA
          ? 'border-green-700/40 text-green-400 bg-green-900/20'
          : 'border-blue-700/40 text-blue-400 bg-blue-900/20'
      }`}
    >
      {isWA ? '📱' : '✈️'} {isWA ? 'WA' : 'TG'}
    </span>
  )
}

function EngagementBadge({ role }: { role?: string }) {
  const r = role ?? 'dormant'
  if (r === 'engaged') {
    return (
      <Badge variant="success" size="sm">
        engajado
      </Badge>
    )
  }
  if (r === 'active') {
    return (
      <Badge variant="default" size="sm">
        ativo
      </Badge>
    )
  }
  return (
    <Badge variant="warning" size="sm">
      dormente
    </Badge>
  )
}

// ── Admin accounts section ────────────────────────────────────────────────────

function AdminAccountsSection({
  admins,
  isProtected,
}: {
  admins: AdminAccount[]
  isProtected: boolean
}) {
  const protCount = admins.filter(a => (a.protected_count ?? 0) > 0).length
  const total = admins.length

  return (
    <div className="border border-border rounded-md p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-fg">Contas admin neste grupo</p>
          <p className="text-xs text-fg-3 mt-0.5">
            Mínimo recomendado: 2 contas independentes para sobreviver a ban.
          </p>
        </div>
        {total > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
              isProtected
                ? 'bg-green-900/20 border border-green-700/40 text-green-400'
                : 'bg-amber-900/20 border border-amber-700/40 text-amber-400'
            }`}
          >
            {isProtected ? '✓' : '⚠'} {protCount}/{total} — {isProtected ? 'protegido' : 'risco'}
          </span>
        )}
      </div>

      {admins.length === 0 ? (
        <p className="text-sm text-fg-3">Nenhuma conta admin registrada.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {admins.map(a => {
            const label = a.initials ?? initials(a.name)
            const color = a.color ?? avatarColor(a.name)
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 bg-surface-2 border border-border rounded-md px-3 py-2.5 min-w-[180px]"
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0 ${color}`}
                >
                  {label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{a.name}</p>
                  {a.phone && (
                    <p className="text-xs text-fg-3">
                      {a.phone} · {a.platform ?? 'WhatsApp'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Members table ─────────────────────────────────────────────────────────────

type MemberFilter = 'all' | 'active' | 'dormant' | 'admin'

function MembersTable({
  members,
  isLoading,
  page,
  onPageChange,
}: {
  members: GroupMember[]
  isLoading: boolean
  page: number
  onPageChange: (p: number) => void
}) {
  const [filter, setFilter] = React.useState<MemberFilter>('all')

  const filtered = React.useMemo(() => {
    if (filter === 'all') return members
    if (filter === 'admin') return members.filter(m => m.role === 'admin')
    if (filter === 'active')
      return members.filter(m => m.engagement === 'active' || m.engagement === 'engaged')
    if (filter === 'dormant') return members.filter(m => m.engagement === 'dormant')
    return members
  }, [members, filter])

  const PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const countAll = members.length
  const countActive = members.filter(
    m => m.engagement === 'active' || m.engagement === 'engaged',
  ).length
  const countDormant = members.filter(m => m.engagement === 'dormant').length
  const countAdmin = members.filter(m => m.role === 'admin').length

  const filterButtons: { id: MemberFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: countAll },
    { id: 'active', label: 'Ativos', count: countActive },
    { id: 'dormant', label: 'Dormentes', count: countDormant },
    { id: 'admin', label: 'Admins', count: countAdmin },
  ]

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Filter bar + sort */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          {filterButtons.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id)
                onPageChange(1)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-accent text-white'
                  : 'bg-surface text-fg-2 border border-border hover:text-fg'
              }`}
            >
              {f.label} · {f.count}
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-3">Ordenar: cliques</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <p className="text-sm text-fg-3 p-6 text-center">Nenhum membro neste filtro.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Membro
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Telefone
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Entrou
              </th>
              <th className="text-right px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Cliques 30d
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Último clique
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Papel
              </th>
              <th className="w-6 px-4" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((m, i) => {
              const displayName = m.name ?? m.jid ?? m.id ?? '—'
              const label = typeof displayName === 'string' ? initials(String(displayName)) : '?'
              const color = avatarColor(String(displayName))
              const engagement = m.engagement ?? (m.role === 'admin' ? 'active' : undefined)
              return (
                <tr
                  key={m.id ?? m.jid ?? i}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white shrink-0 ${color}`}
                      >
                        {label}
                      </span>
                      <div>
                        <p className="font-medium text-fg leading-tight">
                          {typeof displayName === 'string' ? displayName : String(displayName)}
                        </p>
                        {m.jid && m.name && (
                          <p className="text-[10px] text-fg-3 font-mono leading-tight">{m.jid}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-fg-2 font-mono text-xs">{m.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 text-fg-2 text-xs">{relativeTime(m.joined_at)}</td>
                  <td className="px-4 py-2.5 text-right text-fg font-medium">
                    {m.clicks_30d != null ? m.clicks_30d : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-fg-2 text-xs">{relativeTime(m.last_click_at)}</td>
                  <td className="px-4 py-2.5">
                    <EngagementBadge role={engagement} />
                  </td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs">›</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-2">
          <span className="text-xs text-fg-3">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1 text-xs rounded-md bg-surface border border-border text-fg-2 hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹ Anterior
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1 text-xs rounded-md bg-surface border border-border text-fg-2 hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próxima ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [membersPage, setMembersPage] = React.useState(1)

  const { data: group, isLoading } = useQuery<GroupDetail>({
    queryKey: ['groups', id],
    queryFn: () => apiClient.get(`/api/groups/${id}`).then(r => r.data),
    enabled: !!id,
  })

  // Admin accounts — endpoint may not exist yet; graceful fallback
  const { data: admins = [] } = useQuery<AdminAccount[]>({
    queryKey: ['groups', id, 'admins'],
    queryFn: () =>
      apiClient
        .get(`/api/groups/${id}/admins`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    enabled: !!id,
  })

  const { data: members = [], isLoading: membersLoading } = useQuery<GroupMember[]>({
    queryKey: ['groups', id, 'members'],
    queryFn: () =>
      apiClient
        .get(`/api/groups/${id}/members`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!group) {
    return <div className="p-6 text-fg-2">Grupo não encontrado</div>
  }

  const memberCount = group.member_count ?? members.length
  const activeCount = group.active_members ?? members.filter(m => m.engagement === 'active' || m.engagement === 'engaged').length
  const dormantCount = group.dormant_members ?? members.filter(m => m.engagement === 'dormant').length
  const clicks30d = group.clicks_30d ?? 0
  const perMember = group.per_member_clicks != null
    ? group.per_member_clicks.toFixed(1)
    : memberCount > 0 && clicks30d > 0
      ? (clicks30d / memberCount).toFixed(1)
      : '—'
  const totalAudience = group.total_audience
  const isProtected = admins.length >= 2

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        {/* Back + action buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="text-xs text-fg-3 hover:text-fg flex items-center gap-1"
          >
            ← Grupos
          </button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Link de convite
            </Button>
            <Button variant="secondary" size="sm">
              Configurações
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => group.channel_id && navigate(`/channels/${group.channel_id}`)}
            >
              Audiência do canal
            </Button>
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-fg">{group.name}</h1>
          <PlatformBadge platform={group.platform} />
        </div>
        {(group.channel_name || memberCount || totalAudience) && (
          <p className="text-sm text-fg-2 mt-0.5">
            {group.channel_name && (
              <span>
                Canal <strong>{group.channel_name}</strong>
                {' · '}
              </span>
            )}
            {memberCount > 0 && (
              <span>
                {memberCount} membros{totalAudience ? ` de ${totalAudience.toLocaleString('pt-BR')}` : ''}
              </span>
            )}
            {group.last_sent_at && (
              <span> · último envio {relativeTime(group.last_sent_at)}</span>
            )}
          </p>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Membros"
            value={memberCount > 0 ? memberCount.toLocaleString('pt-BR') : '—'}
            subtitle={
              totalAudience && memberCount > 0
                ? `${((memberCount / totalAudience) * 100).toFixed(0)}% da capacidade`
                : undefined
            }
          />
          <KpiCard
            label="Ativos (25+ cliques)"
            value={activeCount > 0 ? activeCount : '—'}
            subtitle={
              memberCount > 0 && activeCount > 0
                ? `${((activeCount / memberCount) * 100).toFixed(0)}% da lista`
                : undefined
            }
          />
          <KpiCard
            label="Dormentes"
            value={dormantCount > 0 ? dormantCount : 0}
            subtitle="0 cliques em 30d"
          />
          <KpiCard
            label="Cliques 30d"
            value={clicks30d > 0 ? clicks30d.toLocaleString('pt-BR') : '—'}
            subtitle={typeof perMember === 'string' && perMember !== '—' ? `${perMember} por membro` : undefined}
          />
        </div>

        {/* Admin accounts */}
        <AdminAccountsSection admins={admins} isProtected={isProtected} />

        {/* Members section */}
        <div>
          <p className="text-sm font-medium text-fg mb-3">Membros</p>
          <MembersTable
            members={members}
            isLoading={membersLoading}
            page={membersPage}
            onPageChange={setMembersPage}
          />
        </div>
      </div>
    </div>
  )
}
