import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  KpiCard,
  Modal,
  PageHeader,
  PlatformPill,
  Skeleton,
  Switch,
  Tabs,
} from '../components/ui'
import { apiClient } from '../lib/apiClient'
import {
  pageContainer,
  sectionCard,
  sectionHeader,
  sectionTitle,
  sectionSubtitle,
  tableContainer,
  tableHeaderCell,
  tableRow,
  tableCell,
  tableCellMuted,
  switchRow,
  formGroup,
  formLabel,
} from '../lib/uiTokens'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SenderAccount {
  id: number
  phone: string
  modem_slug: string
  status: string
}

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
  active_members?: number
  dormant_members?: number
  clicks_30d?: number
  per_member_clicks?: number
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
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]

function avatarColor(seed?: string | null): string {
  const s = seed ?? ''
  let n = 0
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length]
}

function initials(name?: string | null): string {
  const raw = String(name ?? '').trim()
  if (!raw) return '?'
  return raw.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

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
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`
  return `há ${Math.floor(mo / 12)}a`
}

// ── Modals ────────────────────────────────────────────────────────────────────

function InviteLinkModal({ group, onClose, onSaved }: { group: GroupDetail; onClose: () => void; onSaved: () => void }) {
  const [link, setLink] = React.useState(group.invite_link ?? '')
  const [saving, setSaving] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await apiClient.patch(`/api/groups/${group.id}`, { invite_link: link || null })
      onSaved(); onClose()
    } catch { alert('Erro ao salvar link de convite') }
    finally { setSaving(false) }
  }

  const handleCopy = () => {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <Modal open title="Link de convite" onClose={onClose}>
      <p className="text-xs text-fg-3 mb-4">Cole o link de convite do WhatsApp/Telegram.</p>
      <form onSubmit={handleSave} className="space-y-4">
        <div className={formGroup}>
          <label className={formLabel + ' text-xs text-fg-2'}>URL do convite</label>
          <div className="flex gap-2">
            <input
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
            <button type="button" onClick={handleCopy} disabled={!link}
              className="text-xs px-3 py-1.5 rounded-md border border-border text-fg-2 hover:bg-surface-2 disabled:opacity-40 transition-colors">
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
        {group.short_id && (
          <div className={sectionCard + ' text-xs text-fg-3'}>
            <p className="font-medium text-fg-2 mb-1">Link curto do grupo</p>
            <p className="font-mono text-accent">{window.location.origin}/g/{group.short_id}</p>
            <p className="mt-1">Redireciona para o link de convite acima.</p>
          </div>
        )}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border">Cancelar</button>
          <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ConfigModal({ group, onClose, onSaved }: { group: GroupDetail; onClose: () => void; onSaved: () => void }) {
  const isWA = group.platform === 'whatsapp' || group.platform === 'wa'
  const [subject, setSubject] = React.useState(group.name)
  const [propagating, setPropagating] = React.useState(false)

  React.useEffect(() => { setSubject(group.name) }, [group.name])

  const handlePropagate = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!subject.trim()) return
    setPropagating(true)
    try {
      if (isWA) {
        await apiClient.post(`/api/groups/${group.id}/propagate-subject`, { subject: subject.trim() })
      } else {
        await apiClient.patch(`/api/groups/${group.id}`, { name: subject.trim() })
      }
      onSaved(); onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar nome')
    } finally { setPropagating(false) }
  }

  return (
    <Modal open title="Configurações do grupo" onClose={onClose}>
      {isWA && (
        <p className="text-xs text-fg-3 mb-4 leading-snug">
          O nome é atualizado no banco após aplicar no WhatsApp (Evolution).
        </p>
      )}
      <form onSubmit={handlePropagate} className="space-y-4">
        <div className={formGroup}>
          <label className={formLabel + ' text-xs text-fg-2'}>{isWA ? 'Nome do grupo (WhatsApp)' : 'Nome'}</label>
          <input
            required value={subject} onChange={e => setSubject(e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border">Cancelar</button>
          <button type="submit" disabled={propagating || !subject.trim()} className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
            {propagating ? 'Aplicando…' : isWA ? 'Aplicar no WhatsApp' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AddAdminModal({ groupId, onClose, onSuccess }: { groupId: string | number; onClose: () => void; onSuccess: () => void }) {
  const [selectedId, setSelectedId] = React.useState<string>('')
  const [submitting, setSubmitting] = React.useState(false)

  const { data: senderAccounts = [] } = useQuery<SenderAccount[]>({
    queryKey: ['admin-senders-accounts'],
    queryFn: () =>
      apiClient.get<SenderAccount[]>('/api/admin/senders/accounts')
        .then(r => (Array.isArray(r.data) ? r.data : []).filter(a => a.status !== 'banned'))
        .catch(() => []),
    staleTime: 30_000,
  })

  const allAccounts = senderAccounts.map(a => ({ ...a, platform: 'wa' as const }))

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    const found = allAccounts.find(a => String(a.id) === selectedId)
    if (!found) return
    setSubmitting(true)
    try {
      await apiClient.post(`/api/groups/${groupId}/admins`, { account_type: found.platform, account_id: found.id })
      onSuccess(); onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao adicionar admin')
    } finally { setSubmitting(false) }
  }

  return (
    <Modal open title="Adicionar conta admin" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={formGroup}>
          <label className={formLabel + ' text-xs text-fg-2'}>Conta</label>
          <select required value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg">
            <option value="">Selecionar conta...</option>
            {senderAccounts.map(a => (
              <option key={a.id} value={String(a.id)}>📱 {a.phone} ({a.modem_slug})</option>
            ))}
            {senderAccounts.length === 0 && <option disabled value="">Nenhuma conta disponível</option>}
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border">Cancelar</button>
          <button type="submit" disabled={submitting || !selectedId} className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
            {submitting ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Tab: Visão Geral ──────────────────────────────────────────────────────────

function TabOverview({ group, members, admins, isProtected, groupId, onAdminAdded, onInviteLink }: {
  group: GroupDetail
  members: GroupMember[]
  admins: AdminAccount[]
  isProtected: boolean
  groupId: string
  onAdminAdded: () => void
  onInviteLink: () => void
}) {
  const qc = useQueryClient()
  const [showAddAdmin, setShowAddAdmin] = React.useState(false)

  const audienceMut = useMutation({
    mutationFn: () => apiClient.post(`/api/groups/${groupId}/suggest-audience`).then(r => r.data as {
      audience_summary?: string; age_range?: string; peak_hours?: string
      interests?: string[]; best_categories?: string[]; engagement_tip?: string
    }),
  })

  const memberCount = group.member_count ?? members.length
  const activeCount = group.active_members ?? members.filter(m => {
    const n = normalizeEngagement(m.engagement); return n === 'engaged' || n === 'active'
  }).length
  const dormantCount = group.dormant_members ?? members.filter(m => normalizeEngagement(m.engagement) === 'dormant').length
  const clicks30d = group.clicks_30d ?? 0
  const perMember = group.per_member_clicks != null
    ? group.per_member_clicks.toFixed(1)
    : memberCount > 0 && clicks30d > 0 ? (clicks30d / memberCount).toFixed(1) : '—'
  const totalAudience = group.total_audience
  const protCount = admins.filter(a => (a.protected_count ?? 0) > 0).length

  return (
    <div className="space-y-6">
      {/* Audience infer action - Moved to top */}
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" loading={audienceMut.isPending} onClick={() => audienceMut.mutate()}>
          ✨ Inferir audiência
        </Button>
      </div>

      {/* Audience inference result */}
      {audienceMut.data && (
        <div className="bg-accent/5 border border-accent/30 rounded-md p-4">
          <div className={sectionHeader}>
            <p className={sectionTitle}>Perfil inferido da audiência</p>
            <button type="button" onClick={() => audienceMut.reset()} className="text-xs text-fg-3 hover:text-fg">×</button>
          </div>
          {audienceMut.data.audience_summary && <p className="text-sm text-fg-2 mb-2">{audienceMut.data.audience_summary}</p>}
          <div className="grid grid-cols-2 gap-3 mb-2 text-xs">
            {audienceMut.data.age_range && <p><span className="text-fg-3">Faixa etária:</span> <strong className="text-fg">{audienceMut.data.age_range}</strong></p>}
            {audienceMut.data.peak_hours && <p><span className="text-fg-3">Pico:</span> <strong className="text-fg">{audienceMut.data.peak_hours}</strong></p>}
          </div>
          {(audienceMut.data.interests?.length || audienceMut.data.best_categories?.length) ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {audienceMut.data.interests?.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-2">{t}</span>)}
              {audienceMut.data.best_categories?.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-accent/10 border border-accent/30 rounded text-accent">{t}</span>)}
            </div>
          ) : null}
          {audienceMut.data.engagement_tip && <p className="text-xs text-fg-2 mt-2 italic">💡 {audienceMut.data.engagement_tip}</p>}
        </div>
      )}
      {audienceMut.isError && (
        <div className="bg-danger/10 border border-danger/30 rounded-md p-3">
          <p className="text-xs text-danger">Erro ao inferir audiência: {(audienceMut.error as any)?.response?.data?.error ?? 'falha desconhecida'}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Membros" value={memberCount > 0 ? memberCount.toLocaleString('pt-BR') : '—'}
          subtitle={totalAudience && memberCount > 0 ? `${((memberCount / totalAudience) * 100).toFixed(0)}% da capacidade` : undefined} />
        <KpiCard label="Ativos (25+ cliques)" value={activeCount > 0 ? activeCount : '—'}
          subtitle={memberCount > 0 && activeCount > 0 ? `${((activeCount / memberCount) * 100).toFixed(0)}% da lista` : undefined} />
        <KpiCard label="Dormentes" value={dormantCount > 0 ? dormantCount : 0} subtitle="0 cliques em 30d" />
        <KpiCard label="Cliques 30d" value={clicks30d > 0 ? clicks30d.toLocaleString('pt-BR') : '—'}
          subtitle={typeof perMember === 'string' && perMember !== '—' ? `${perMember} por membro` : undefined} />
      </div>

      {/* Channel / invite info */}
      {(group.channel_name || group.invite_link) && (
        <div className={sectionCard}>
          <p className={sectionTitle + ' mb-3'}>Vínculos</p>
          {group.channel_name && (
            <p className="text-sm text-fg-2 mb-1">Canal: <strong className="text-fg">{group.channel_name}</strong></p>
          )}
          {group.invite_link ? (
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-accent truncate flex-1">{group.invite_link}</p>
              <button type="button" onClick={onInviteLink} className="text-xs text-fg-3 hover:text-fg border border-border rounded px-2 py-0.5">Editar</button>
            </div>
          ) : (
            <button type="button" onClick={onInviteLink} className="text-xs text-fg-3 hover:text-fg underline">+ Adicionar link de convite</button>
          )}
        </div>
      )}

      {/* Admin accounts */}
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <div>
            <p className={sectionTitle}>Contas admin</p>
            <p className={sectionSubtitle}>Mínimo recomendado: 2 contas independentes para sobreviver a ban.</p>
          </div>
          <div className="flex items-center gap-2">
            {admins.length > 0 && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                isProtected ? 'bg-success/10 border border-success/30 text-success' : 'bg-warning/10 border border-warning/30 text-warning'
              }`}>
                {isProtected ? '✓' : '⚠'} {protCount}/{admins.length} — {isProtected ? 'protegido' : 'risco'}
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowAddAdmin(true)}>+ Admin</Button>
          </div>
        </div>

        {admins.length === 0 ? (
          <p className="text-sm text-fg-3">Nenhuma conta admin registrada.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {admins.map(a => {
              const label = a.initials ?? initials(a.name)
              const color = a.color ?? avatarColor(a.name)
              return (
                <div key={a.id} className="flex items-center gap-2.5 bg-surface-2 border border-border rounded-md px-3 py-2.5 min-w-[160px]">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0 ${color}`}>{label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg truncate">{a.name}</p>
                    {a.phone && <p className="text-xs text-fg-3">{a.phone} · {a.platform ?? 'WhatsApp'}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showAddAdmin && (
          <AddAdminModal
            groupId={groupId}
            onClose={() => setShowAddAdmin(false)}
            onSuccess={() => { onAdminAdded(); setShowAddAdmin(false) }}
          />
        )}
      </div>

    </div>
  )
}

// ── Tab: Membros ──────────────────────────────────────────────────────────────

type MemberFilter = 'all' | 'active' | 'dormant' | 'admin'

function TabMembers({ members, isLoading }: { members: GroupMember[]; isLoading: boolean }) {
  const [filter, setFilter] = React.useState<MemberFilter>('all')
  const [page, setPage] = React.useState(1)

  const filtered = React.useMemo(() => {
    if (filter === 'all') return members
    if (filter === 'admin') return members.filter(m => m.role === 'admin')
    if (filter === 'active') return members.filter(m => { const n = normalizeEngagement(m.engagement); return n === 'engaged' || n === 'active' })
    return members.filter(m => normalizeEngagement(m.engagement) === 'dormant')
  }, [members, filter])

  const PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  React.useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = {
    all: members.length,
    active: members.filter(m => { const n = normalizeEngagement(m.engagement); return n === 'engaged' || n === 'active' }).length,
    dormant: members.filter(m => normalizeEngagement(m.engagement) === 'dormant').length,
    admin: members.filter(m => m.role === 'admin').length,
  }

  const filterButtons: { id: MemberFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'active', label: 'Ativos' },
    { id: 'dormant', label: 'Dormentes' },
    { id: 'admin', label: 'Admins' },
  ]

  return (
    <div className={tableContainer}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          {filterButtons.map(f => (
            <button key={f.id} type="button" onClick={() => { setFilter(f.id); setPage(1) }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-accent text-white' : 'bg-surface text-fg-2 border border-border hover:text-fg'
              }`}>
              {f.label} · {counts[f.id]}
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-3">{members.length > 0 ? `página ${page}/${totalPages}` : ''}</span>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : paginated.length === 0 ? (
        <p className="text-sm text-fg-3 p-6 text-center">Nenhum membro neste filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Membro', 'Telefone', 'Entrou', 'Cliques 30d', 'Último clique', 'Engajamento', 'Papel', ''].map((h, i) => (
                  <th key={i} className={`${tableHeaderCell} ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((m, i) => {
                const displayName = m.name ?? m.jid ?? m.id ?? '—'
                const label = initials(String(displayName))
                const color = avatarColor(String(displayName))
                const engagement = normalizeEngagement(m.engagement)
                return (
                  <tr key={String(m.jid ?? m.id ?? i)} className={tableRow}>
                    <td className={tableCell}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white shrink-0 ${color}`}>{label}</span>
                        <div>
                          <p className="font-medium leading-tight">{String(displayName)}</p>
                          {m.jid && m.name && <p className="text-[10px] text-fg-3 font-mono leading-tight">{m.jid}</p>}
                        </div>
                      </div>
                    </td>
                    <td className={tableCellMuted + ' font-mono text-xs'}>{m.phone ?? '—'}</td>
                    <td className={tableCellMuted + ' text-xs'}>{relativeTime(m.joined_at)}</td>
                    <td className={tableCell + ' text-right font-medium'}>{m.clicks_30d != null ? m.clicks_30d : '—'}</td>
                    <td className={tableCellMuted + ' text-xs'}>{relativeTime(m.last_click_at)}</td>
                    <td className={tableCell}>
                      {engagement === 'engaged' ? <Badge variant="success" size="sm">engajado</Badge>
                        : engagement === 'active' ? <Badge variant="default" size="sm">ativo</Badge>
                        : <Badge variant="warning" size="sm">dormente</Badge>}
                    </td>
                    <td className={tableCell}>
                      {m.role === 'admin' ? <Badge variant="default" size="sm">admin</Badge> : <span className="text-xs text-fg-3">membro</span>}
                    </td>
                    <td className="px-4 py-2.5 text-fg-3 text-xs">›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-2">
          <span className="text-xs text-fg-3">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-2.5 py-1 text-xs rounded-md bg-surface border border-border text-fg-2 hover:text-fg disabled:opacity-40">
                ‹ Anterior
              </button>
              <button type="button" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="px-2.5 py-1 text-xs rounded-md bg-surface border border-border text-fg-2 hover:text-fg disabled:opacity-40">
                Próxima ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: Configuração ─────────────────────────────────────────────────────────

function TabConfig({ group, onSaved }: { group: GroupDetail; onSaved: () => void }) {
  const [showConfig, setShowConfig] = React.useState(false)
  const isWA = group.platform === 'whatsapp' || group.platform === 'wa'

  return (
    <div className="space-y-4 max-w-lg">
      <div className={sectionCard}>
        <p className={sectionTitle + ' mb-3'}>Identidade</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-fg-2">
            <span>Plataforma</span>
            <PlatformPill platform={group.platform} />
          </div>
          <div className="flex justify-between text-fg-2">
            <span>Nome</span>
            <span className="text-fg font-medium">{group.name}</span>
          </div>
          {group.channel_name && (
            <div className="flex justify-between text-fg-2">
              <span>Canal</span>
              <span className="text-fg">{group.channel_name}</span>
            </div>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <Button variant="secondary" size="sm" onClick={() => setShowConfig(true)}>
            {isWA ? 'Aplicar nome no WhatsApp' : 'Editar nome'}
          </Button>
        </div>
      </div>

      {group.invite_link !== undefined && (
        <div className={sectionCard}>
          <p className={sectionTitle + ' mb-2'}>Link de convite</p>
          {group.invite_link ? (
            <p className="text-xs font-mono text-accent break-all">{group.invite_link}</p>
          ) : (
            <p className="text-xs text-fg-3">Nenhum link configurado.</p>
          )}
        </div>
      )}

      {showConfig && (
        <ConfigModal group={group} onClose={() => setShowConfig(false)} onSaved={onSaved} />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState('overview')
  const [showInviteModal, setShowInviteModal] = React.useState(false)
  const [showConfigModal, setShowConfigModal] = React.useState(false)

  const { data: group, isLoading } = useQuery<GroupDetail>({
    queryKey: ['groups', id],
    queryFn: () => apiClient.get(`/api/groups/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: admins = [] } = useQuery<AdminAccount[]>({
    queryKey: ['groups', id, 'admins'],
    queryFn: () => apiClient.get(`/api/groups/${id}/admins`).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    enabled: !!id,
  })

  const { data: members = [], isLoading: membersLoading } = useQuery<GroupMember[]>({
    queryKey: ['groups', id, 'members'],
    queryFn: () => apiClient.get(`/api/groups/${id}/members`).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    enabled: !!id,
  })

  const fetchInviteMut = useMutation({
    mutationFn: () => apiClient.post(`/api/groups/${id}/fetch-invite`).then(r => r.data as { invite_link?: string; updated?: boolean }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', id] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/groups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); navigate('/groups') },
  })

  if (isLoading) {
    return (
      <div className={pageContainer + ' space-y-4'}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!group) return <div className="p-6 text-fg-2">Grupo não encontrado</div>

  const isWAPlat = group.platform === 'whatsapp' || group.platform === 'wa'
  const verified = group.verified_admin_count
  const isProtected = isWAPlat && typeof verified === 'number' ? verified >= 2 : admins.length >= 2

  const TABS = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'members', label: `Membros${members.length > 0 ? ` (${members.length})` : ''}` },
    { id: 'config', label: 'Configuração' },
  ]

  const refreshGroup = () => {
    qc.invalidateQueries({ queryKey: ['groups', id] })
    qc.invalidateQueries({ queryKey: ['groups', id, 'admins'] })
    qc.invalidateQueries({ queryKey: ['groups', id, 'members'] })
  }

  return (
    <div className={pageContainer + ' flex flex-col'}>
      {/* Header */}
      <PageHeader
        size="md"
        title={
          <span className="flex items-center gap-2">
            {group.name}
            <PlatformPill platform={group.platform} />
          </span>
        }
        subtitle={
          <span>
            {group.channel_name && <span>Canal <strong>{group.channel_name}</strong> · </span>}
            {(group.member_count ?? 0) > 0 && <span>{(group.member_count ?? 0).toLocaleString('pt-BR')} membros</span>}
            {group.last_sent_at && <span> · último envio {relativeTime(group.last_sent_at)}</span>}
          </span>
        }
        className="mb-4"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate('/groups')} className="text-xs text-fg-3 hover:text-fg flex items-center gap-1">
              ← Grupos
            </button>
            {isWAPlat && (
              <Button variant="secondary" size="sm" loading={fetchInviteMut.isPending} onClick={() => fetchInviteMut.mutate()} title="Buscar invite link via Evolution API">
                🔗 Auto-buscar invite
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowInviteModal(true)}>Link de convite</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowConfigModal(true)}>Configurações</Button>
            <Button
              variant="danger" size="sm" loading={deleteMut.isPending}
              onClick={() => {
                if (confirm(`Remover o cadastro do grupo "${group.name}"? Esta ação não pode ser desfeita.`)) deleteMut.mutate()
              }}
            >
              Remover
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-4" />

      {/* Tab content */}
      <div className="flex-1">
        {tab === 'overview' && (
          <TabOverview
            group={group}
            members={members}
            admins={admins}
            isProtected={isProtected}
            groupId={id!}
            onAdminAdded={refreshGroup}
            onInviteLink={() => setShowInviteModal(true)}
          />
        )}
        {tab === 'members' && <TabMembers members={members} isLoading={membersLoading} />}
        {tab === 'config' && <TabConfig group={group} onSaved={refreshGroup} />}
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
