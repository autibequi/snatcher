import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GroupDetail {
  id: string | number
  short_id?: string
  name: string
  platform: string
  status?: string
  member_count?: number
  channel_name?: string
  channel_id?: number
  total_audience?: number
  last_sent_at?: string
  invite_link?: string | null
  // KPI fields — may be absent (backend enrichment)
  active_members?: number
  dormant_members?: number
  clicks_30d?: number
  per_member_clicks?: number
  /** WA: admins cadastrados que a Evolution confirma como admin no grupo */
  verified_admin_count?: number
  admin_count?: number
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

function avatarColor(seed?: string | null): string {
  const s = seed ?? ''
  let n = 0
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length]
}

/** Nome ausente/vazio → '?' (backend pode omitir name em contas admin). */
function initials(name?: string | null): string {
  const raw = String(name ?? '').trim()
  if (!raw) return '?'
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Backend pode enviar engajamento em PT (engajado/ativo/dormente) ou EN. */
function normalizeEngagement(e?: string): 'engaged' | 'active' | 'dormant' {
  if (!e) return 'dormant'
  const x = e.toLowerCase()
  if (x === 'engajado' || x === 'engaged') return 'engaged'
  if (x === 'ativo' || x === 'active') return 'active'
  return 'dormant'
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

function GroupRoleBadge({ role }: { role?: string }) {
  if (role === 'admin') {
    return (
      <Badge variant="default" size="sm">
        admin
      </Badge>
    )
  }
  return <span className="text-xs text-fg-3">membro</span>
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

// ── Invite Link Modal ─────────────────────────────────────────────────────────

function InviteLinkModal({
  group,
  onClose,
  onSaved,
}: {
  group: GroupDetail
  onClose: () => void
  onSaved: () => void
}) {
  const [link, setLink] = React.useState(group.invite_link ?? '')
  const [saving, setSaving] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await apiClient.patch(`/api/groups/${group.id}`, { invite_link: link || null })
      onSaved()
      onClose()
    } catch {
      alert('Erro ao salvar link de convite')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-fg mb-1">Link de convite</h3>
        <p className="text-xs text-fg-3 mb-4">Link para entrar neste grupo. Cole o link de convite do WhatsApp/Telegram.</p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">URL do convite</label>
            <div className="flex gap-2">
              <input
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleCopy}
                disabled={!link}
                className="text-xs px-3 py-1.5 rounded-md border border-border text-fg-2 hover:bg-surface-2 disabled:opacity-40 transition-colors"
              >
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
          {group.short_id && (
            <div className="bg-surface-2 rounded-md p-3 text-xs text-fg-3">
              <p className="font-medium text-fg-2 mb-1">Link curto do grupo</p>
              <p className="font-mono text-accent">{window.location.origin}/g/{group.short_id}</p>
              <p className="mt-1 text-fg-3">Use este link em materiais de divulgação — redireciona para o link de convite acima.</p>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Config Modal ──────────────────────────────────────────────────────────────

function ConfigModal({
  group,
  onClose,
  onSaved,
}: {
  group: GroupDetail
  onClose: () => void
  onSaved: () => void
}) {
  const isWA = group.platform === 'whatsapp' || group.platform === 'wa'
  const [subject, setSubject] = React.useState(group.name)
  const [propagating, setPropagating] = React.useState(false)

  React.useEffect(() => {
    setSubject(group.name)
  }, [group.name])

  const handlePropagate = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!subject.trim()) return
    if (!isWA) {
      setPropagating(true)
      try {
        await apiClient.patch(`/api/groups/${group.id}`, { name: subject.trim() })
        onSaved()
        onClose()
      } catch {
        alert('Erro ao salvar nome')
      } finally {
        setPropagating(false)
      }
      return
    }
    setPropagating(true)
    try {
      await apiClient.post(`/api/groups/${group.id}/propagate-subject`, { subject: subject.trim() })
      onSaved()
      onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err?.message ?? 'Erro ao aplicar nome no WhatsApp')
    } finally {
      setPropagating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-fg mb-1">Configurações do grupo</h3>
        {isWA && (
          <p className="text-[11px] text-fg-3 mb-4 leading-snug">
            O nome exibido no Snatcher só é atualizado no banco depois de aplicar no WhatsApp (Evolution). Você pode editar o
            texto abaixo e confirmar.
          </p>
        )}
        <form onSubmit={handlePropagate} className="space-y-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">{isWA ? 'Nome do grupo (WhatsApp)' : 'Nome'}</label>
            <input
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={propagating || !subject.trim()}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {propagating ? 'Aplicando…' : isWA ? 'Aplicar no WhatsApp' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Admin Modal ───────────────────────────────────────────────────────────

interface AccountOption {
  id: number
  name: string
  phone?: string
  platform: 'wa' | 'tg'
}

function AddAdminModal({
  groupId,
  onClose,
  onSuccess,
}: {
  groupId: string | number
  onClose: () => void
  onSuccess: () => void
}) {
  const [selectedId, setSelectedId] = React.useState<string>('')
  const [submitting, setSubmitting] = React.useState(false)

  const { data: waAccounts = [] } = useQuery<AccountOption[]>({
    queryKey: ['accounts', 'wa'],
    queryFn: () =>
      apiClient
        .get('/api/accounts/wa')
        .then(r => (Array.isArray(r.data) ? r.data.map((a: any) => ({ ...a, platform: 'wa' as const })) : []))
        .catch(() => []),
    staleTime: 30_000,
  })

  const { data: tgAccounts = [] } = useQuery<AccountOption[]>({
    queryKey: ['accounts', 'tg'],
    queryFn: () =>
      apiClient
        .get('/api/accounts/tg')
        .then(r => (Array.isArray(r.data) ? r.data.map((a: any) => ({ ...a, platform: 'tg' as const })) : []))
        .catch(() => []),
    staleTime: 30_000,
  })

  const allAccounts = [...waAccounts, ...tgAccounts]

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!selectedId) return
    const found = allAccounts.find(a => String(a.id) === selectedId)
    if (!found) return
    setSubmitting(true)
    try {
      await apiClient.post(`/api/groups/${groupId}/admins`, {
        account_type: found.platform,
        account_id: found.id,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao adicionar admin')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-6 w-full max-w-sm shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-fg mb-4">Adicionar conta admin</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Conta</label>
            <select
              required
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            >
              <option value="">Selecionar conta...</option>
              {waAccounts.length > 0 && (
                <optgroup label="WhatsApp">
                  {waAccounts.map(a => (
                    <option key={`wa-${a.id}`} value={String(a.id)}>
                      {a.name}{a.phone ? ` (${a.phone})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {tgAccounts.length > 0 && (
                <optgroup label="Telegram">
                  {tgAccounts.map(a => (
                    <option key={`tg-${a.id}`} value={String(a.id)}>
                      {a.name}{a.phone ? ` (${a.phone})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {allAccounts.length === 0 && (
                <option disabled value="">Nenhuma conta disponível</option>
              )}
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedId}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Admin accounts section ────────────────────────────────────────────────────

function AdminAccountsSection({
  groupId,
  admins,
  isProtected,
  onAdminAdded,
}: {
  groupId: string | number
  admins: AdminAccount[]
  isProtected: boolean
  onAdminAdded: () => void
}) {
  const qc = useQueryClient()
  const [showAddModal, setShowAddModal] = React.useState(false)

  const protCount = admins.filter(a => (a.protected_count ?? 0) > 0).length
  const total = admins.length

  const removeAdmin = useMutation({
    mutationFn: (adminId: number) =>
      apiClient.delete(`/api/groups/${groupId}/admins/${adminId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups', String(groupId), 'admins'] })
    },
    onError: (err) => {
      console.error('[remove-admin] DELETE failed (BE may not be ready yet):', err)
    },
  })

  return (
    <div className="border border-border rounded-md p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-fg">Contas admin neste grupo</p>
          <p className="text-xs text-fg-3 mt-0.5">
            Mínimo recomendado: 2 contas independentes para sobreviver a ban.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddModal(true)}
          >
            + Adicionar admin
          </Button>
        </div>
      </div>

      {admins.length === 0 ? (
        <p className="text-sm text-fg-3">Nenhuma conta admin registrada.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {admins.map(a => {
            const label = a.initials ?? initials(a.name)
            const color = a.color ?? avatarColor(a.name)
            const isRemoving = removeAdmin.isPending && removeAdmin.variables === a.id
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg truncate">{a.name}</p>
                  {a.phone && (
                    <p className="text-xs text-fg-3">
                      {a.phone} · {a.platform ?? 'WhatsApp'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={() => removeAdmin.mutate(a.id)}
                  className="text-fg-3 hover:text-danger transition-colors text-sm p-0.5 disabled:opacity-40"
                  title="Remover admin"
                >
                  ✗
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showAddModal && (
        <AddAdminModal
          groupId={groupId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            onAdminAdded()
            setShowAddModal(false)
          }}
        />
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
      return members.filter(m => {
        const n = normalizeEngagement(m.engagement)
        return n === 'engaged' || n === 'active'
      })
    if (filter === 'dormant')
      return members.filter(m => normalizeEngagement(m.engagement) === 'dormant')
    return members
  }, [members, filter])

  const PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  React.useEffect(() => {
    if (page > totalPages) onPageChange(totalPages)
  }, [page, totalPages, onPageChange])

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const countAll = members.length
  const countActive = members.filter(m => {
    const n = normalizeEngagement(m.engagement)
    return n === 'engaged' || n === 'active'
  }).length
  const countDormant = members.filter(m => normalizeEngagement(m.engagement) === 'dormant').length
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
        <span className="text-xs text-fg-3">
          {members.length > 0 ? `${members.length} carregados · página ${page}/${totalPages}` : ''}
        </span>
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
        <div className="overflow-x-auto">
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
                Engajamento
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Papel (WA)
              </th>
              <th className="w-6 px-4" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((m, i) => {
              const displayName = m.name ?? m.jid ?? m.id ?? '—'
              const label = typeof displayName === 'string' ? initials(String(displayName)) : '?'
              const color = avatarColor(String(displayName))
              const engagement = normalizeEngagement(m.engagement)
              return (
                <tr
                  key={String(m.jid ?? m.id ?? i)}
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
                  <td className="px-4 py-2.5">
                    <GroupRoleBadge role={m.role} />
                  </td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs">›</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Pagination — sempre mostra faixa; botões só se houver mais de uma página */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-2">
          <span className="text-xs text-fg-3">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}{' '}
            no filtro
            {filter !== 'all' && countAll !== filtered.length ? ` (${countAll} no total)` : ''}
          </span>
          {totalPages > 1 ? (
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
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [membersPage, setMembersPage] = React.useState(1)
  const [showInviteModal, setShowInviteModal] = React.useState(false)
  const [showConfigModal, setShowConfigModal] = React.useState(false)

  React.useEffect(() => {
    setMembersPage(1)
  }, [id])

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

  // Hooks devem vir antes de qualquer early return (regra do React).
  const audienceMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/groups/${id}/suggest-audience`)
        .then(r => r.data as {
          audience_summary?: string
          age_range?: string
          peak_hours?: string
          interests?: string[]
          best_categories?: string[]
          engagement_tip?: string
        }),
  })

  const fetchInviteMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/groups/${id}/fetch-invite`)
        .then(r => r.data as { invite_link?: string; updated?: boolean }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', id] }),
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
  const activeCount =
    group.active_members ??
    members.filter(m => {
      const n = normalizeEngagement(m.engagement)
      return n === 'engaged' || n === 'active'
    }).length
  const dormantCount =
    group.dormant_members ?? members.filter(m => normalizeEngagement(m.engagement) === 'dormant').length
  const clicks30d = group.clicks_30d ?? 0
  const perMember = group.per_member_clicks != null
    ? group.per_member_clicks.toFixed(1)
    : memberCount > 0 && clicks30d > 0
      ? (clicks30d / memberCount).toFixed(1)
      : '—'
  const totalAudience = group.total_audience
  const isWAPlat = group.platform === 'whatsapp' || group.platform === 'wa'
  const verified = group.verified_admin_count
  const isProtected =
    isWAPlat && typeof verified === 'number'
      ? verified >= 2
      : admins.length >= 2

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
            <Button
              variant="secondary"
              size="sm"
              loading={audienceMut.isPending}
              onClick={() => audienceMut.mutate()}
              title="Inferir perfil da audiência via IA"
            >
              ✨ Inferir audiência
            </Button>
            {group.platform === 'whatsapp' && (
              <Button
                variant="secondary"
                size="sm"
                loading={fetchInviteMut.isPending}
                onClick={() => fetchInviteMut.mutate()}
                title="Buscar invite link automaticamente via Evolution API"
              >
                🔗 Auto-buscar invite
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowInviteModal(true)}>
              Link de convite
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowConfigModal(true)}>
              Configurações
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
        {audienceMut.data && (
          <div className="bg-accent/5 border border-accent/30 rounded-md p-4 mb-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-semibold text-fg">🎯 Perfil inferido da audiência</p>
              <button
                type="button"
                onClick={() => audienceMut.reset()}
                className="text-xs text-fg-3 hover:text-fg"
              >
                ×
              </button>
            </div>
            {audienceMut.data.audience_summary && (
              <p className="text-sm text-fg-2 mb-2">{audienceMut.data.audience_summary}</p>
            )}
            <div className="grid grid-cols-2 gap-3 mb-2 text-xs">
              {audienceMut.data.age_range && (
                <p><span className="text-fg-3">Faixa etária:</span> <strong className="text-fg">{audienceMut.data.age_range}</strong></p>
              )}
              {audienceMut.data.peak_hours && (
                <p><span className="text-fg-3">Pico de atividade:</span> <strong className="text-fg">{audienceMut.data.peak_hours}</strong></p>
              )}
            </div>
            {(audienceMut.data.interests?.length || audienceMut.data.best_categories?.length) ? (
              <div className="flex flex-wrap gap-1 mb-2">
                {audienceMut.data.interests?.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-2">{t}</span>
                ))}
                {audienceMut.data.best_categories?.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 bg-accent/10 border border-accent/30 rounded text-accent">{t}</span>
                ))}
              </div>
            ) : null}
            {audienceMut.data.engagement_tip && (
              <p className="text-xs text-fg-2 mt-2 italic">💡 {audienceMut.data.engagement_tip}</p>
            )}
          </div>
        )}
        {audienceMut.isError && (
          <div className="bg-danger/10 border border-danger/30 rounded-md p-3 mb-6">
            <p className="text-xs text-danger">
              Erro ao inferir audiência: {(audienceMut.error as any)?.response?.data?.error ?? 'falha desconhecida'}
            </p>
          </div>
        )}
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
        <AdminAccountsSection
          groupId={id!}
          admins={admins}
          isProtected={isProtected}
          onAdminAdded={() => {
            qc.invalidateQueries({ queryKey: ['groups', id, 'admins'] })
            qc.invalidateQueries({ queryKey: ['groups', id] })
            qc.invalidateQueries({ queryKey: ['groups', id, 'members'] })
          }}
        />

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

      {showInviteModal && (
        <InviteLinkModal
          group={group}
          onClose={() => setShowInviteModal(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['groups', id] })}
        />
      )}
      {showConfigModal && (
        <ConfigModal
          group={group}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['groups', id] })}
        />
      )}
    </div>
  )
}
