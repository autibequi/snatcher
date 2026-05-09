import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, EmptyState, Skeleton, Input, Spinner } from '../components/ui'
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
  /** Admins cadastrados que a Evolution confirma como admin no grupo (WA). */
  verified_admin_count?: number
  admins?: Array<{ initials: string; color?: string }>
  status?: string
  audience_status?: 'profile' | 'no_profile' | string
  /** Mesmo JID em N linhas = grupo físico em N canais (backend). */
  channels_count?: number
  jid?: string | null
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
  verifiedAdminCount,
  platform,
}: {
  admins?: Array<{ initials: string; color?: string }>
  adminCount?: number
  verifiedAdminCount?: number
  platform?: string
}) {
  const isWA = platform === 'whatsapp' || platform === 'wa'
  const registered = adminCount ?? admins?.length ?? 0
  const effective =
    isWA && typeof verifiedAdminCount === 'number' ? verifiedAdminCount : registered
  const avatarList = admins ?? []
  const show = avatarList.slice(0, 3)
  const isRisky = effective < 2

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
      {effective > 0 || registered > 0 ? (
        <span className={`text-xs font-medium tabular-nums ${isRisky ? 'text-warning' : 'text-fg-2'}`}>
          {effective}
          {isWA && typeof verifiedAdminCount === 'number' && verifiedAdminCount !== registered ? (
            <span className="text-fg-3 font-normal">/{registered}</span>
          ) : null}
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

function hasAudienceProfile(audienceStatus?: string): boolean {
  return audienceStatus === 'profile' || audienceStatus === 'perfil'
}

function AudienceBadge({ audienceStatus }: { audienceStatus?: string }) {
  if (!audienceStatus) return <span className="text-xs text-fg-3">—</span>
  const hasProfile = hasAudienceProfile(audienceStatus)
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

function effectiveAdminRiskCount(g: GroupRow): number {
  const isWA = g.platform === 'whatsapp' || g.platform === 'wa'
  if (isWA && typeof g.verified_admin_count === 'number') return g.verified_admin_count
  return g.admin_count ?? g.admins?.length ?? 0
}

function formatCanaisLabel(count?: number): string {
  if (count == null || count === 0) return '—'
  return count === 1 ? '1 canal' : `${count} canais`
}

/** Um mesmo JID (grupo WA físico) pode ter N linhas no DB (N canais); a listagem mostra 1 linha por grupo físico. */
function mergeDuplicateGroupRows(a: GroupRow, b: GroupRow): GroupRow {
  const idNum = (x: string | number) => Number(x)
  const first = idNum(a.id) <= idNum(b.id) ? a : b
  const second = idNum(a.id) <= idNum(b.id) ? b : a

  const mem = (g: GroupRow) => Math.max(g.member_count ?? 0, g.size ?? 0)

  return {
    ...first,
    id: first.id,
    channels_count: Math.max(a.channels_count ?? 0, b.channels_count ?? 0),
    verified_admin_count: Math.max(
      a.verified_admin_count ?? 0,
      b.verified_admin_count ?? 0,
    ),
    admin_count: Math.max(a.admin_count ?? 0, b.admin_count ?? 0),
    audience_status:
      hasAudienceProfile(a.audience_status) || hasAudienceProfile(b.audience_status)
        ? 'perfil'
        : (first.audience_status ?? second.audience_status),
    account_label: first.account_label || second.account_label,
    admins:
      (first.admins?.length ?? 0) >= (second.admins?.length ?? 0)
        ? first.admins
        : second.admins,
    member_count: Math.max(mem(a), mem(b)) || undefined,
    size: Math.max(a.size ?? 0, b.size ?? 0) || undefined,
  }
}

function dedupeGroupsByPhysicalJid(groups: GroupRow[]): GroupRow[] {
  const byJid = new Map<string, GroupRow>()
  const noJid: GroupRow[] = []

  for (const g of groups) {
    const jid = String(g.jid ?? '').trim()
    if (!jid) {
      noJid.push(g)
      continue
    }
    const prev = byJid.get(jid)
    if (!prev) {
      byJid.set(jid, g)
    } else {
      byJid.set(jid, mergeDuplicateGroupRows(prev, g))
    }
  }

  const merged = [...byJid.values(), ...noJid]
  merged.sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR', {
      sensitivity: 'base',
    }),
  )
  return merged
}

function AdminRiskBanner({ groups }: { groups: GroupRow[] }) {
  const risky = groups.filter(g => effectiveAdminRiskCount(g) < 2)
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
          ? 'Nenhum grupo cadastrado. Use "Importar grupo" para buscar grupos na conta WhatsApp.'
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
              Canais
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
                <td className="px-4 py-2.5 text-fg-2 whitespace-nowrap">
                  {formatCanaisLabel(g.channels_count)}
                </td>
                <td className="px-4 py-2.5 text-fg-2">
                  {g.account_label ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-fg-2">
                  {memberCount != null ? memberCount.toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <AdminAvatars
                    admins={g.admins}
                    adminCount={g.admin_count}
                    verifiedAdminCount={g.verified_admin_count}
                    platform={g.platform}
                  />
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

  // Flat groups list from /api/groups — backend returns 1 row per DB row (same JID pode repetir por canal)
  const { data: groupsRaw = [], isLoading: groupsLoading } = useQuery<GroupRow[]>({
    queryKey: ['groups'],
    queryFn: () =>
      apiClient
        .get('/api/groups')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const groups = useMemo(() => dedupeGroupsByPhysicalJid(groupsRaw), [groupsRaw])

  const qc = useQueryClient()

  const activeWA = waAccounts.filter(a => a.active)
  const connectedWA = waAccounts.filter(a => a.status === 'connected').length
  const activeTG = tgAccounts.filter(a => a.active)
  const isLoading = waLoading || tgLoading || groupsLoading

  // ── Modal: importar grupos da Evolution (sem vincular canal aqui) ───────────
  const [showImport, setShowImport] = useState(false)
  const [importAccountId, setImportAccountId] = useState('')
  const [modalSearch, setModalSearch] = useState('')

  const importAccount = activeWA.find(a => String(a.id) === importAccountId)

  const { data: waGroupOptions = [], isLoading: waGroupsLoading, isFetching: waGroupsFetching, refetch: refetchWaModal } =
    useQuery<WAGroupOption[]>({
      queryKey: ['wa-groups-import-modal', importAccountId],
      queryFn: () =>
        apiClient
          .get(`/api/accounts/wa/${importAccountId}/groups`)
          .then(r => (Array.isArray(r.data) ? r.data : []))
          .catch(() => []),
      enabled: showImport && !!importAccountId && importAccount?.status === 'connected',
      refetchInterval: (q) => {
        const data = q.state.data as WAGroupOption[] | undefined
        return data && data.length > 0 ? 60_000 : 15_000
      },
    })

  const linkedJIDs = useMemo(
    () => new Set(groupsRaw.map(g => String(g.jid ?? '').trim()).filter(Boolean)),
    [groupsRaw],
  )

  const importOneMut = useMutation({
    mutationFn: (opt: WAGroupOption) =>
      apiClient.post('/api/groups', {
        name: opt.name,
        platform: 'whatsapp',
        wa_account_id: Number(importAccountId),
        jid: opt.id,
        member_count: opt.size,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? err?.message ?? 'Erro ao importar'),
  })

  const openImport = () => {
    const first =
      activeWA.find(a => a.status === 'connected') ?? activeWA[0]
    setImportAccountId(first ? String(first.id) : '')
    setModalSearch('')
    setShowImport(true)
  }

  const modalFiltered = waGroupOptions.filter(g =>
    !modalSearch.trim() || g.name.toLowerCase().includes(modalSearch.trim().toLowerCase()),
  )
  const modalUnlinked = modalFiltered.filter(g => !linkedJIDs.has(g.id))

  /** Lista vazia + fetch inicial ou refetch (polling Evolution): mostrar loading, não o aviso de “ainda não retornou”. */
  const waModalLoadingEmpty =
    !!importAccountId &&
    importAccount?.status === 'connected' &&
    waGroupOptions.length === 0 &&
    (waGroupsLoading || waGroupsFetching)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          {!isLoading && (
            <p className="text-xs text-fg-3 mt-0.5">
              {connectedWA} WA conectada{connectedWA !== 1 ? 's' : ''} · {activeTG.length} TG
              configurada{activeTG.length !== 1 ? 's' : ''} · {groups.length} grupo
              {groups.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button variant="primary" size="sm" disabled={activeWA.length === 0} onClick={openImport}>
          Importar grupo
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

      {showImport && activeWA.length > 0 && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImport(false)}
        >
          <div
            className="bg-surface border border-border rounded-lg p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-semibold text-fg text-base">Importar grupos</h3>
                <p className="text-xs text-fg-3 mt-1">
                  Escolha a conta WhatsApp e importe cada grupo. A vinculação a canais é feita depois.
                </p>
              </div>
              <button type="button" className="text-fg-3 hover:text-fg text-xl leading-none" onClick={() => setShowImport(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-fg-2 mb-1 block">Conta WhatsApp</label>
              <select
                className="w-full max-w-md text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                value={importAccountId}
                onChange={e => setImportAccountId(e.target.value)}
              >
                {activeWA.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.status !== 'connected' ? ' (desconectada)' : ''}
                  </option>
                ))}
              </select>
              {importAccount && importAccount.status !== 'connected' && (
                <p className="text-xs text-warning mt-2">Conecte esta conta em Contas para listar grupos da Evolution.</p>
              )}
            </div>

            {importAccount?.status === 'connected' && (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <input
                    type="text"
                    className="flex-1 min-w-[200px] text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                    placeholder="Filtrar pelo nome…"
                    value={modalSearch}
                    onChange={e => setModalSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => refetchWaModal()}
                    disabled={waGroupsFetching}
                    className="text-xs text-fg-3 hover:text-fg border border-border rounded-md px-2 py-1.5 disabled:opacity-50"
                  >
                    ↻ Atualizar
                  </button>
                  {waGroupsFetching && (
                    <span className="text-[10px] text-fg-3">atualizando…</span>
                  )}
                </div>

                {waModalLoadingEmpty ? (
                  <div
                    className="border border-border rounded-md p-8 bg-surface-2 flex flex-col items-center justify-center gap-3 min-h-[140px]"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <Spinner size="md" />
                    <p className="text-sm text-fg font-medium">Buscando grupos na Evolution…</p>
                    <p className="text-[11px] text-fg-3 text-center max-w-sm leading-snug">
                      Aguarde alguns segundos após conectar o WhatsApp. A lista atualiza automaticamente.
                    </p>
                  </div>
                ) : waGroupOptions.length === 0 ? (
                  <div className="border border-border rounded-md p-4 bg-surface-2 text-center">
                    <p className="text-xs text-fg-3">Evolution ainda não retornou grupos desta conta.</p>
                    <p className="text-[10px] text-fg-3 mt-1">Tente atualizar ou aguarde alguns segundos após conectar.</p>
                  </div>
                ) : (
                  <div className="border border-border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-2 border-b border-border">
                          <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Nome</th>
                          <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase">Membros</th>
                          <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase w-36"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalUnlinked.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-xs text-fg-3">
                              {modalFiltered.length === 0
                                ? `Nenhum resultado para "${modalSearch.trim()}".`
                                : 'Todos os grupos desta lista já foram importados.'}
                            </td>
                          </tr>
                        ) : (
                          modalUnlinked.map(g => (
                            <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                              <td className="px-4 py-2.5 text-fg">{g.name}</td>
                              <td className="px-4 py-2.5 text-right text-fg-2 tabular-nums">{g.size}</td>
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  type="button"
                                  disabled={importOneMut.isPending}
                                  onClick={() => importOneMut.mutate(g)}
                                  className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
                                >
                                  Importar
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end mt-4">
              <Button variant="secondary" size="sm" onClick={() => setShowImport(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
