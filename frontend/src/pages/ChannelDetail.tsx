import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Badge, Button, Tabs, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import AudienceEditor from '../components/AudienceEditor'

// ── Preview WA inline (bolha verde) ──────────────────────────────────────────
function WAMessagePreview({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-center text-white/60 mb-3">Preview WhatsApp · clique fora para fechar</p>
        <div className="bg-[#0b141a] rounded-xl p-4 shadow-2xl">
          <div className="bg-[#005c4b] rounded-xl p-3 ml-auto max-w-[90%] shadow">
            <p className="text-sm text-white whitespace-pre-wrap break-words">{text || '...'}</p>
            <p className="text-xs text-green-300 mt-1.5 text-right opacity-60">agora ✓✓</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Histórico de disparos do canal ────────────────────────────────────────────
function ChannelHistory({ channelId }: { channelId: string }) {
  const [previewText, setPreviewText] = React.useState<string | null>(null)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['channels', channelId, 'history'],
    queryFn: () => apiClient.get(`/api/channels/${channelId}/history`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 30_000,
  })

  const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    delivered: 'success', sending: 'warning', failed: 'danger', pending: 'default',
  }

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
  if (!entries.length) return <p className="text-sm text-fg-3">Nenhum disparo para este canal ainda.</p>

  return (
    <>
      {previewText !== null && <WAMessagePreview text={previewText} onClose={() => setPreviewText(null)} />}
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th>
              <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Grupo</th>
              <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e: any, i: number) => {
              let msgText = ''
              try { msgText = typeof e.message === 'string' ? JSON.parse(e.message)?.text ?? '' : e.message_text ?? '' } catch {}
              const groupName = e.group_name || `grupo #${e.group_id}`
              return (
                <tr
                  key={`${e.dispatch_id}-${i}`}
                  className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                  onClick={() => setPreviewText(msgText)}
                  title="Clique para ver preview WA"
                >
                  <td className="px-4 py-2.5 text-fg max-w-xs">
                    <p className="truncate text-xs">{msgText || `#${e.dispatch_id}`}</p>
                    <p className="text-xs text-accent opacity-60 mt-0.5">ver preview →</p>
                  </td>
                  <td className="px-4 py-2.5 text-fg-2 text-xs">{groupName}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant[e.status] ?? 'default'} size="sm">{e.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs text-right">
                    {new Date(e.created_at).toLocaleString('pt-BR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

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

// ── Aba: Regras (filtro + notificações) ──────────────────────────────────────

interface ChannelRule {
  id: number
  channel_id: number
  match_type: string
  match_value?: string | null
  max_price?: number | null
  notify_new: boolean
  notify_drop: boolean
  notify_lowest: boolean
  drop_threshold: number
  active: boolean
}

const MATCH_TYPES = [
  { value: 'all',      label: 'Todos os produtos' },
  { value: 'category', label: 'Categoria' },
  { value: 'brand',    label: 'Marca' },
  { value: 'keyword',  label: 'Palavra-chave' },
]

const matchTypeLabel = (v: string) => MATCH_TYPES.find(t => t.value === v)?.label ?? v

interface RuleFormState {
  match_type: string
  match_value: string
  max_price: string
  notify_new: boolean
  notify_drop: boolean
  notify_lowest: boolean
  drop_threshold: number
  active: boolean
}

const emptyRuleForm: RuleFormState = {
  match_type: 'all',
  match_value: '',
  max_price: '',
  notify_new: true,
  notify_drop: true,
  notify_lowest: false,
  drop_threshold: 10,
  active: true,
}

function ruleToForm(r: ChannelRule): RuleFormState {
  return {
    match_type: r.match_type || 'all',
    match_value: r.match_value ?? '',
    max_price: r.max_price != null ? String(r.max_price) : '',
    notify_new: !!r.notify_new,
    notify_drop: !!r.notify_drop,
    notify_lowest: !!r.notify_lowest,
    drop_threshold: r.drop_threshold > 1 ? r.drop_threshold : Math.round((r.drop_threshold || 0.1) * 100),
    active: r.active !== false,
  }
}

function formToPayload(f: RuleFormState) {
  const payload: Record<string, any> = {
    match_type: f.match_type,
    notify_new: f.notify_new,
    notify_drop: f.notify_drop,
    notify_lowest: f.notify_lowest,
    drop_threshold: (f.drop_threshold || 10) / 100,
    active: f.active,
  }
  if (f.match_type !== 'all' && f.match_value.trim()) {
    payload.match_value = f.match_value.trim()
  }
  const mp = parseFloat(f.max_price)
  if (!Number.isNaN(mp) && mp > 0) payload.max_price = mp
  return payload
}

function ChannelRules({ channelId }: { channelId: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<ChannelRule | 'new' | null>(null)
  const [form, setForm] = React.useState<RuleFormState>(emptyRuleForm)

  const { data: rules = [], isLoading } = useQuery<ChannelRule[]>({
    queryKey: ['channels', channelId, 'rules'],
    queryFn: () =>
      apiClient
        .get(`/api/channels/${channelId}/rules`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    staleTime: 30_000,
  })

  const closeModal = () => setEditing(null)

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = formToPayload(form)
      if (editing && editing !== 'new') {
        return apiClient.put(`/api/channels/${channelId}/rules/${editing.id}`, payload).then(r => r.data)
      }
      return apiClient.post(`/api/channels/${channelId}/rules`, payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', channelId, 'rules'] })
      closeModal()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar regra'),
  })

  const deleteMut = useMutation({
    mutationFn: (ruleId: number) =>
      apiClient.delete(`/api/channels/${channelId}/rules/${ruleId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['channels', channelId, 'rules'] }),
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Erro ao remover regra'),
  })

  function openNew() {
    setForm(emptyRuleForm)
    setEditing('new')
  }

  function openEdit(rule: ChannelRule) {
    setForm(ruleToForm(rule))
    setEditing(rule)
  }

  const isEditing = editing && editing !== 'new'
  const needsValue = form.match_type !== 'all'
  const canSave = !needsValue || form.match_value.trim().length > 0

  return (
    <>
      {editing && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-fg mb-4">{isEditing ? 'Editar regra' : 'Adicionar regra'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-fg-2 block mb-1">Filtro de produto</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                  value={form.match_type}
                  onChange={e => setForm(f => ({ ...f, match_type: e.target.value }))}
                >
                  {MATCH_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {needsValue && (
                <div>
                  <label className="text-xs text-fg-2 block mb-1">
                    Valor ({matchTypeLabel(form.match_type).toLowerCase()})
                  </label>
                  <input
                    type="text"
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                    placeholder="Ex: suplementos / growth / whey"
                    value={form.match_value}
                    onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-fg-2 block mb-1">Preço máximo (R$, opcional)</label>
                <input
                  type="number"
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                  placeholder="ex: 199.90"
                  value={form.max_price}
                  onChange={e => setForm(f => ({ ...f, max_price: e.target.value }))}
                />
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-fg-2 font-medium mb-2">Notificações</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                    <input type="checkbox" checked={form.notify_new}
                      onChange={e => setForm(f => ({ ...f, notify_new: e.target.checked }))} />
                    Produto novo encontrado
                  </label>
                  <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                    <input type="checkbox" checked={form.notify_drop}
                      onChange={e => setForm(f => ({ ...f, notify_drop: e.target.checked }))} />
                    Queda de preço ≥
                    <input type="number" min={1} max={99} className="w-14 text-xs border border-border rounded px-1.5 py-0.5 bg-surface text-fg"
                      value={form.drop_threshold}
                      onChange={e => setForm(f => ({ ...f, drop_threshold: Number(e.target.value) || 10 }))}
                      disabled={!form.notify_drop} />
                    %
                  </label>
                  <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                    <input type="checkbox" checked={form.notify_lowest}
                      onChange={e => setForm(f => ({ ...f, notify_lowest: e.target.checked }))} />
                    Menor preço histórico
                  </label>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                  <input type="checkbox" checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  Regra ativa
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <Button variant="secondary" size="sm" onClick={closeModal}>Cancelar</Button>
              <Button
                variant="primary"
                size="sm"
                loading={saveMut.isPending}
                disabled={!canSave}
                onClick={() => saveMut.mutate()}
              >
                {isEditing ? 'Salvar' : 'Criar regra'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-fg-2">
            Filtros e notificações para produtos deste canal
          </p>
          <Button variant="primary" size="sm" onClick={openNew}>+ Adicionar regra</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : rules.length === 0 ? (
          <div className="border border-border rounded-md p-6 text-center">
            <p className="text-sm text-fg-3 mb-1">Nenhuma regra configurada.</p>
            <p className="text-xs text-fg-3">
              Regras controlam quais produtos do catálogo viram disparos neste canal.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => {
              const notifs: string[] = []
              if (rule.notify_new) notifs.push('produto novo')
              if (rule.notify_drop) notifs.push(`queda ≥ ${Math.round((rule.drop_threshold || 0.1) * 100)}%`)
              if (rule.notify_lowest) notifs.push('menor preço histórico')
              return (
                <div
                  key={rule.id}
                  className="border border-border rounded-md p-4 flex items-start justify-between gap-4 bg-surface hover:bg-surface-2 cursor-pointer transition-colors"
                  onClick={() => openEdit(rule)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium bg-surface-2 text-fg-2 px-2 py-0.5 rounded uppercase tracking-wide">
                        Filtro
                      </span>
                      <span className="text-sm text-fg">
                        {matchTypeLabel(rule.match_type)}
                        {rule.match_value ? <span className="text-fg-2"> = </span> : null}
                        {rule.match_value && <span className="font-mono text-accent">{rule.match_value}</span>}
                      </span>
                      {rule.max_price != null && (
                        <span className="text-xs text-fg-3">
                          até R$ {rule.max_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {!rule.active && (
                        <span className="text-xs px-1.5 py-0.5 rounded border border-fg-3 text-fg-3">pausada</span>
                      )}
                    </div>
                    <p className="text-xs text-fg-3 mt-2">
                      Notifica: {notifs.length > 0 ? notifs.join(' · ') : <span className="italic">nada</span>}
                    </p>
                  </div>
                  <div className="flex gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      onClick={() => openEdit(rule)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => {
                        if (confirm('Remover esta regra?')) deleteMut.mutate(rule.id)
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ── Aba: Demografia (stub) ────────────────────────────────────────────────────

function ChannelDemographics() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">Distribuição demográfica estimada da audiência do canal.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Gênero */}
        <div className="border border-border rounded-md p-4 bg-surface">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Gênero</p>
          <div className="space-y-2">
            {[{ label: 'Feminino', pct: 58 }, { label: 'Masculino', pct: 38 }, { label: 'Outro', pct: 4 }].map(g => (
              <div key={g.label}>
                <div className="flex justify-between text-xs text-fg-2 mb-0.5">
                  <span>{g.label}</span>
                  <span>{g.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${g.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Faixa etária */}
        <div className="border border-border rounded-md p-4 bg-surface">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Faixa etária</p>
          <div className="space-y-2">
            {[{ label: '18–24', pct: 22 }, { label: '25–34', pct: 40 }, { label: '35–44', pct: 25 }, { label: '45+', pct: 13 }].map(a => (
              <div key={a.label}>
                <div className="flex justify-between text-xs text-fg-2 mb-0.5">
                  <span>{a.label}</span>
                  <span>{a.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${a.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Região */}
        <div className="border border-border rounded-md p-4 bg-surface">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Região</p>
          <div className="space-y-2">
            {[{ label: 'Sudeste', pct: 45 }, { label: 'Sul', pct: 20 }, { label: 'Nordeste', pct: 18 }, { label: 'Outros', pct: 17 }].map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-xs text-fg-2 mb-0.5">
                  <span>{r.label}</span>
                  <span>{r.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Aba: Link público ─────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ChannelPublicLink({ channelId, channel }: { channelId: string; channel: { name?: string; slug?: string } }) {
  const qc = useQueryClient()
  const initialSlug = channel.slug || slugify(channel.name || '')
  const [slug, setSlug] = React.useState(initialSlug)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    setSlug(channel.slug || slugify(channel.name || ''))
  }, [channel.slug, channel.name])

  const fullURL = `${window.location.origin}/canal/${slug}`

  const saveMut = useMutation({
    mutationFn: () => apiClient.put(`/api/channels/${channelId}`, { ...channel, slug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', channelId] })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar slug'),
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(fullURL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const slugChanged = slug !== (channel.slug || slugify(channel.name || ''))

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-fg-2">
        Link público compartilhável. Aponta para uma página que oferece os grupos disponíveis (WhatsApp/Telegram) para o usuário escolher.
        Quando um grupo enche, basta atualizar o link de convite na aba <strong>Grupos</strong>.
      </p>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Slug (parte da URL)</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-3 font-mono">{window.location.host}/canal/</span>
          <input
            value={slug}
            onChange={e => setSlug(slugify(e.target.value))}
            placeholder={slugify(channel.name || 'meu-canal')}
            className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!slug || !slugChanged || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            loading={saveMut.isPending}
          >
            Salvar
          </Button>
        </div>
        <p className="text-xs text-fg-3 mt-1">
          Por default, gerado do nome do canal. Pode ser editado para algo mais curto.
        </p>
      </div>

      <div className="border border-border rounded-md p-4 bg-surface-2">
        <p className="text-xs text-fg-2 font-medium uppercase tracking-wide mb-2">Link completo</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-accent bg-surface border border-border rounded px-2 py-1.5 truncate">
            {fullURL}
          </code>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </Button>
          <a href={fullURL} target="_blank" rel="noopener" className="text-sm text-accent hover:underline px-2">
            abrir →
          </a>
        </div>
      </div>

      <div className="text-xs text-fg-3 border-t border-border pt-3">
        Ao acessar, o usuário vê uma página com os grupos ativos do canal e escolhe um para entrar.
        Configure os grupos e seus invite links na aba <strong>Grupos</strong>.
      </div>
    </div>
  )
}

// ── Bar chart 7 dias ──────────────────────────────────────────────────────────

interface DayPoint { day: string; value: number }

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function emptyLast7Days(): DayPoint[] {
  const today = new Date()
  const out: DayPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({ day: WEEKDAY_LABELS[d.getDay()], value: 0 })
  }
  return out
}

function DisparoChart({ metrics }: { metrics: any }) {
  const { data, hasData } = React.useMemo(() => {
    const series = metrics?.dispatches_7d_series
    if (Array.isArray(series) && series.length > 0) {
      const mapped = (series as { day: string; value: number }[]).map(p => ({ day: p.day, value: p.value }))
      return { data: mapped, hasData: mapped.some(p => p.value > 0) }
    }
    return { data: emptyLast7Days(), hasData: false }
  }, [metrics])

  return (
    <div className="border border-border rounded-md p-4 bg-surface">
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">
        Disparos — últimos 7 dias
      </p>
      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-fg-3, #9ca3af)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-fg-3, #9ca3af)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, fontSize: 12 }}
              cursor={{ fill: 'var(--color-surface-2, #f3f4f6)' }}
            />
            <Bar dataKey="value" name="Disparos" fill="var(--color-accent, #6366f1)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-end gap-2 h-[120px] px-2 pb-4 opacity-40">
          {data.map((p, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full bg-fg-3/20 rounded-t-sm" style={{ height: '4px' }} />
              <span className="text-[10px] text-fg-3">{p.day}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-fg-3 italic">sem disparos no período</span>
          </div>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'audience', label: 'Audiência' },
  { id: 'demographics', label: 'Demografia' },
  { id: 'groups', label: 'Grupos' },
  { id: 'rules', label: 'Regras' },
  { id: 'history', label: 'Histórico' },
  { id: 'publiclink', label: 'Link público' },
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Disparos 7D"
                tooltip="Número de mensagens enviadas pelos grupos deste canal nos últimos 7 dias."
                value={metrics?.dispatches_7d ?? metrics?.dispatches_last_7d ?? '—'}
              />
              <KpiCard
                label="CTR"
                tooltip="Click-Through Rate: percentual de pessoas que clicaram no link após receber a mensagem. Calculado sobre os últimos 30 dias."
                value={metrics?.ctr ? `${(metrics.ctr * 100).toFixed(1)}%` : '—'}
              />
              <KpiCard
                label="Produtos"
                tooltip="Quantidade de produtos únicos já disparados para os grupos deste canal."
                value={metrics?.product_count ?? metrics?.products ?? '—'}
              />
              <KpiCard
                label="Cliques estimados"
                tooltip="Total de cliques registrados nos links dos disparos enviados para os grupos deste canal."
                value={
                  metrics?.estimated_clicks != null
                    ? Number(metrics.estimated_clicks).toLocaleString('pt-BR')
                    : '—'
                }
              />
            </div>
            <DisparoChart metrics={metrics} />
          </div>
        )}

        {tab === 'audience' && (
          <AudienceEditor channelId={id!} audience={audience} />
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

        {tab === 'demographics' && (
          <ChannelDemographics />
        )}

        {tab === 'rules' && (
          <div className="border border-border rounded-md p-6 bg-surface">
            <p className="text-sm text-fg mb-2">
              As regras deste canal foram movidas para a área de <strong>Automações</strong>.
            </p>
            <p className="text-xs text-fg-3 mb-4">
              Lá você pode ligar/desligar o canal, configurar threshold, filtros e notificações em um só lugar.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/automations?channel=${id}`)}
            >
              Configurar em Automações →
            </Button>
          </div>
        )}

        {tab === 'history' && (
          <ChannelHistory channelId={id!} />
        )}

        {tab === 'publiclink' && (
          <ChannelPublicLink channelId={id!} channel={channel} />
        )}
      </div>
    </div>
  )
}
