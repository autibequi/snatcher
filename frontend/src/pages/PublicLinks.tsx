import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  EmptyState,
  KpiCard,
  Modal,
  PageHeader,
  Skeleton,
} from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { usePublicLinkBaseURL, usePublicLinkPrefix } from '../hooks/useBrand'
import {
  responsiveKpiGrid,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableCell,
  tableCellMuted,
  tableContainer,
  tableHeaderCell,
  tableRow,
} from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Group {
  id: number
  name: string
  status?: 'active' | 'paused' | 'full' | 'banned'
  platform?: string
}

interface FallbackGroup {
  group_id: number
  group_name?: string
  priority: number
  status?: Group['status']
}

interface PublicLink {
  id: number
  slug: string
  channel_id: number
  channel_name?: string
  redirect_strategy: string
  active: boolean
  clicks_30d: number
  clicks_7d?: number
  current_target?: string
  fallback_chain?: FallbackGroup[] | string
}

interface Channel {
  id: number
  name: string
  slug?: string
  active?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseChain(raw: PublicLink['fallback_chain']): FallbackGroup[] {
  if (Array.isArray(raw)) return raw as FallbackGroup[]
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {
      try {
        const decoded = atob(raw)
        const parsed = JSON.parse(decoded)
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
  }
  return []
}

function strategyLabel(s: string): string {
  return s === 'first_active' ? 'Primeiro ativo'
    : s === 'least_full' ? 'Menos cheio'
    : s === 'round_robin' ? 'Round-robin'
    : s
}

function GroupStatusBadge({ status }: { status?: Group['status'] }) {
  if (!status || status === 'active') return null
  const map: Record<string, [string, string]> = {
    paused:  ['Pausado', 'warning'],
    full:    ['Cheio',   'danger'],
    banned:  ['Banido',  'danger'],
  }
  const [label, variant] = map[status] ?? [status, 'default']
  return <Badge variant={variant as any} className="ml-1">{label}</Badge>
}

// ── FallbackChainEditor ───────────────────────────────────────────────────────

interface FallbackChainEditorProps {
  chain: FallbackGroup[]
  groups: Group[]
  saving: boolean
  onChange: (chain: FallbackGroup[]) => void
}

function FallbackChainEditor({ chain, groups, saving, onChange }: FallbackChainEditorProps) {
  const [showAdd, setShowAdd] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...chain]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next.map((g, i) => ({ ...g, priority: i + 1 })))
  }

  const remove = (groupId: number) => {
    onChange(
      chain
        .filter(g => g.group_id !== groupId)
        .map((g, i) => ({ ...g, priority: i + 1 })),
    )
  }

  const add = (group: Group) => {
    setShowAdd(false)
    setSearch('')
    if (chain.some(g => g.group_id === group.id)) return
    onChange([
      ...chain,
      { group_id: group.id, group_name: group.name, priority: chain.length + 1, status: group.status },
    ])
  }

  const inChainIds = new Set(chain.map(g => g.group_id))
  const filteredGroups = groups.filter(
    g => !inChainIds.has(g.id) && g.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-2">
      {/* Add group bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Cadeia de fallback</p>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(v => !v)} disabled={saving}>
          + Adicionar grupo
        </Button>
      </div>

      {showAdd && (
        <div className={`${sectionCard} space-y-2`}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar grupo..."
            className="w-full h-7 px-2.5 text-xs rounded-md border border-border bg-surface text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filteredGroups.length === 0 ? (
              <p className="text-xs text-fg-3 py-1 text-center">Nenhum grupo disponível</p>
            ) : (
              filteredGroups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => add(g)}
                  className="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded-md hover:bg-surface-2 text-fg"
                >
                  <span className="flex-1 truncate">{g.name}</span>
                  <GroupStatusBadge status={g.status} />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chain list */}
      {chain.length === 0 ? (
        <p className="text-xs text-fg-3 py-2">
          Nenhum grupo na cadeia. Adicione grupos como destinos de fallback.
        </p>
      ) : (
        <ol className="space-y-1">
          {chain.map((g, idx) => (
            <li
              key={g.group_id}
              className="flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-2"
            >
              <span className="text-xs text-fg-3 w-5 tabular-nums text-right select-none">
                {idx + 1}.
              </span>
              <span className="flex-1 text-sm text-fg truncate">{g.group_name ?? `grupo #${g.group_id}`}</span>
              <GroupStatusBadge status={g.status} />
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0 || saving}
                  className="text-fg-3 hover:text-fg disabled:opacity-25 leading-none text-xs p-0.5 rounded"
                  title="Subir"
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === chain.length - 1 || saving}
                  className="text-fg-3 hover:text-fg disabled:opacity-25 leading-none text-xs p-0.5 rounded"
                  title="Descer"
                >
                  &#9660;
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(g.group_id)}
                disabled={saving}
                className="text-fg-3 hover:text-danger text-sm leading-none ml-1 disabled:opacity-25"
                title="Remover"
              >
                &times;
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-fg-3">
        O servidor redireciona para o primeiro grupo aberto, com vagas e ativo. A ordem da cadeia determina a prioridade.
      </p>
    </div>
  )
}

// ── EditLinkModal ─────────────────────────────────────────────────────────────

interface EditLinkModalProps {
  link: PublicLink
  groups: Group[]
  onClose: () => void
}

function EditLinkModal({ link, groups, onClose }: EditLinkModalProps) {
  const qc = useQueryClient()
  const baseURL = usePublicLinkBaseURL()
  const fullUrl = `${baseURL}/${link.slug}`
  const [copied, setCopied] = React.useState(false)
  const [chain, setChain] = React.useState<FallbackGroup[]>(() => parseChain(link.fallback_chain))
  const [strategy, setStrategy] = React.useState(link.redirect_strategy)

  const saveMut = useMutation({
    mutationFn: (payload: { fallback_chain: FallbackGroup[]; redirect_strategy: string }) =>
      apiClient.patch(`/api/public-links/${link.id}`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-links'] })
      onClose()
    },
  })

  const copyUrl = () => {
    navigator.clipboard?.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const hasChanges =
    JSON.stringify(chain) !== JSON.stringify(parseChain(link.fallback_chain)) ||
    strategy !== link.redirect_strategy

  return (
    <Modal
      open
      title={`Editar /${link.slug}`}
      onClose={onClose}
      panelClassName="max-w-lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saveMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasChanges || saveMut.isPending}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate({ fallback_chain: chain, redirect_strategy: strategy })}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* URL row */}
        <div>
          <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-2">URL pública</p>
          <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-2">
            <span className="flex-1 text-sm text-fg font-mono truncate">{fullUrl}</span>
            <Button variant="secondary" size="sm" onClick={copyUrl}>
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
          </div>
        </div>

        {/* Strategy */}
        <div>
          <label className="text-xs font-medium text-fg-2 uppercase tracking-wide block mb-1.5">
            Estratégia de roteamento
          </label>
          <select
            value={strategy}
            onChange={e => setStrategy(e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="first_active">Primeiro ativo</option>
            <option value="least_full">Menos cheio</option>
            <option value="round_robin">Round-robin</option>
          </select>
        </div>

        {/* Fallback chain editor */}
        <FallbackChainEditor
          chain={chain}
          groups={groups}
          saving={saveMut.isPending}
          onChange={setChain}
        />
      </div>
    </Modal>
  )
}

// ── CreateLinkModal ───────────────────────────────────────────────────────────

interface CreateLinkModalProps {
  channels: Channel[]
  onClose: () => void
}

function CreateLinkModal({ channels, onClose }: CreateLinkModalProps) {
  const qc = useQueryClient()
  const linkPrefix = usePublicLinkPrefix()
  const [form, setForm] = React.useState({
    slug: '',
    channel_id: '',
    redirect_strategy: 'first_active',
  })
  const [error, setError] = React.useState('')

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/public-links', {
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        channel_id: Number(form.channel_id),
        fallback_chain: [],
        redirect_strategy: form.redirect_strategy,
        active: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-links'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Erro ao criar link')
    },
  })

  const canSubmit = form.slug.trim() !== '' && form.channel_id !== ''

  return (
    <Modal
      open
      title="Novo link público"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={createMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit || createMut.isPending}
            loading={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Criar link
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="text-xs text-danger">{error}</p>}

        {/* Slug */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-fg-2">Slug (a-z, números, hífen) *</label>
          <div className="flex items-center border border-border rounded-md overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
            <span className="px-2.5 py-1.5 text-xs text-fg-3 bg-surface-2 whitespace-nowrap border-r border-border">
              {linkPrefix}
            </span>
            <input
              autoFocus
              value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              className="flex-1 text-sm px-2.5 py-1.5 bg-surface text-fg outline-none"
              placeholder="suplementos"
            />
          </div>
        </div>

        {/* Canal */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-fg-2">Canal *</label>
          <select
            value={form.channel_id}
            onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Selecionar canal...</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </div>

        {/* Estratégia */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-fg-2">Estratégia de fallback</label>
          <select
            value={form.redirect_strategy}
            onChange={e => setForm(f => ({ ...f, redirect_strategy: e.target.value }))}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="first_active">Primeiro ativo</option>
            <option value="least_full">Menos cheio</option>
            <option value="round_robin">Round-robin</option>
          </select>
        </div>

        <p className="text-xs text-fg-3">
          A cadeia de fallback pode ser configurada após criar o link.
        </p>
      </div>
    </Modal>
  )
}

// ── InlineFallbackChain (tabela) ──────────────────────────────────────────────

function InlineFallbackChain({ chain }: { chain: FallbackGroup[] }) {
  if (chain.length === 0) {
    return <span className="text-xs text-danger">sem fallback</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chain.map((g, i) => (
        <span key={g.group_id} className="inline-flex items-center gap-0.5 text-xs">
          <span className="text-fg-3 tabular-nums">{i + 1}.</span>
          <span className="text-fg">{g.group_name ?? `#${g.group_id}`}</span>
          {g.status && g.status !== 'active' && (
            <GroupStatusBadge status={g.status} />
          )}
          {i < chain.length - 1 && <span className="text-fg-3 mx-0.5">→</span>}
        </span>
      ))}
    </div>
  )
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  link: PublicLink
  onClose: () => void
}

function DeleteConfirmModal({ link, onClose }: DeleteConfirmModalProps) {
  const qc = useQueryClient()
  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/public-links/${link.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-links'] })
      onClose()
    },
  })

  return (
    <Modal
      open
      title="Excluir link público"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={deleteMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteMut.isPending}
            onClick={() => deleteMut.mutate()}
          >
            Excluir
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg">
        Deseja excluir o link <span className="font-mono font-medium">/{link.slug}</span>? Esta ação é irreversível.
      </p>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PublicLinks() {
  const qc = useQueryClient()
  const linkPrefix = usePublicLinkPrefix()
  const linkBaseURL = usePublicLinkBaseURL()

  const [showCreate, setShowCreate] = React.useState(false)
  const [editingLink, setEditingLink] = React.useState<PublicLink | null>(null)
  const [deletingLink, setDeletingLink] = React.useState<PublicLink | null>(null)

  const { data: links = [], isLoading } = useQuery<PublicLink[]>({
    queryKey: ['public-links'],
    queryFn: () =>
      apiClient
        .get('/api/public-links')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
  })

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels-select'],
    queryFn: () =>
      apiClient
        .get('/api/channels')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? []))),
  })

  // Groups for fallback chain editor
  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['groups-select'],
    queryFn: () =>
      apiClient
        .get('/api/groups')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])))
        .catch(() => []),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiClient.patch(`/api/public-links/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-links'] }),
  })

  // ── KPI derivations ──────────────────────────────────────────────────────────
  const activeCount = links.filter(l => l.active).length
  const clicks30d = links.reduce((s, l) => s + l.clicks_30d, 0)
  const noFallback = links.filter(l => parseChain(l.fallback_chain).length === 0).length
  const avgClicksPerDay = links.length > 0
    ? Math.round(links.reduce((s, l) => s + l.clicks_30d / 30, 0) / links.length)
    : 0

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 space-y-5">
      {/* ── Header ── */}
      <PageHeader
        title="Links públicos"
        subtitle="URL estável que sempre resolve para um grupo válido — sobrevive a trocas de grupo."
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            + Novo link
          </Button>
        }
      />

      {/* ── KPIs ── */}
      <div className={responsiveKpiGrid}>
        <KpiCard label="Links ativos" value={activeCount} />
        <KpiCard label="Cliques 30d" value={clicks30d.toLocaleString('pt-BR')} />
        <KpiCard
          label="Média / link / dia"
          value={avgClicksPerDay}
          subtitle="cliques/dia por link"
        />
        <KpiCard
          label="Links com risco"
          value={noFallback}
          subtitle="sem fallback configurado"
          delta={
            noFallback > 0
              ? { value: -1, tone: 'danger', displayText: 'sem fallback' }
              : undefined
          }
        />
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : links.length === 0 ? (
        <EmptyState
          title="Nenhum link público"
          description="Crie links estáveis com fallback automático entre grupos."
          cta={{ label: '+ Novo link', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className={`${sectionCard} p-0 overflow-hidden`}>
          <div className={`${sectionHeader} px-4 py-3 border-b border-border mb-0`}>
            <p className={sectionTitle}>Todos os links &middot; {links.length}</p>
          </div>

          {/* Responsive: overflow-x on mobile */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className={tableHeaderCell}>Slug / URL</th>
                  <th className={tableHeaderCell}>Canal</th>
                  <th className={tableHeaderCell}>Cadeia de fallback</th>
                  <th className={tableHeaderCell}>Estratégia</th>
                  <th className={tableHeaderCell}>Cliques 30d</th>
                  <th className={tableHeaderCell}>Status</th>
                  <th className={tableHeaderCell}></th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => {
                  const chain = parseChain(link.fallback_chain)
                  const fullUrl = `${linkBaseURL}/${link.slug}`
                  return (
                    <tr key={link.id} className={tableRow}>
                      {/* Slug + copy */}
                      <td className={tableCell}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-fg">
                            {linkPrefix}{link.slug}
                          </span>
                          <button
                            type="button"
                            title="Copiar URL"
                            onClick={() => navigator.clipboard?.writeText(fullUrl)}
                            className="text-fg-3 hover:text-accent shrink-0 p-0.5 rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" strokeLinejoin="round"/>
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                        {link.current_target && (
                          <p className="text-xs text-fg-3 mt-0.5">
                            agora em <span className="text-fg-2">{link.current_target}</span>
                          </p>
                        )}
                      </td>

                      {/* Canal */}
                      <td className={tableCellMuted}>
                        {link.channel_name ?? <span className="text-fg-3">—</span>}
                      </td>

                      {/* Fallback chain inline */}
                      <td className={tableCell}>
                        <InlineFallbackChain chain={chain} />
                      </td>

                      {/* Strategy */}
                      <td className={tableCellMuted}>
                        {strategyLabel(link.redirect_strategy)}
                      </td>

                      {/* Clicks */}
                      <td className={tableCell}>
                        {link.clicks_30d.toLocaleString('pt-BR')}
                      </td>

                      {/* Status badge */}
                      <td className={tableCell}>
                        <Badge variant={link.active ? 'success' : 'default'}>
                          {link.active ? 'ativo' : 'inativo'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className={`${tableCell} text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingLink(link)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleMut.mutate({ id: link.id, active: !link.active })
                            }
                          >
                            {link.active ? 'Pausar' : 'Ativar'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingLink(link)}
                            className="hover:text-danger"
                          >
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateLinkModal channels={channels} onClose={() => setShowCreate(false)} />
      )}
      {editingLink && (
        <EditLinkModal
          link={editingLink}
          groups={groups}
          onClose={() => setEditingLink(null)}
        />
      )}
      {deletingLink && (
        <DeleteConfirmModal link={deletingLink} onClose={() => setDeletingLink(null)} />
      )}
    </div>
  )
}
