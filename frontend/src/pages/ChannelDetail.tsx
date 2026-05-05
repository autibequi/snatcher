import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Badge, Button, Tabs, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

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

// ── Editor de audiência do canal ─────────────────────────────────────────────
function AudienceEditor({ channelId, audience }: { channelId: string; audience: any }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    categories: '',
    brands: '',
    min_drop: '',
    min_price: '',
    max_price: '',
    gender: '',
  })
  const [saved, setSaved] = React.useState(false)

  // Sincronizar com dados do servidor
  React.useEffect(() => {
    if (!audience) return
    setForm({
      categories: (audience.categories ?? []).join(', '),
      brands: (audience.brands ?? []).join(', '),
      min_drop: audience.min_drop ? String(audience.min_drop) : '',
      min_price: audience.min_price ? String(audience.min_price) : '',
      max_price: audience.max_price ? String(audience.max_price) : '',
      gender: audience.gender ?? '',
    })
  }, [audience])

  const saveMut = useMutation({
    mutationFn: () => {
      const newAudience = {
        categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
        brands: form.brands.split(',').map(s => s.trim()).filter(Boolean),
        min_drop: form.min_drop ? Number(form.min_drop) : 0,
        min_price: form.min_price ? Number(form.min_price) : 0,
        max_price: form.max_price ? Number(form.max_price) : 0,
        gender: form.gender || 'mix',
        locales: audience?.locales ?? [],
        age_range: audience?.age_range ?? [0, 99],
      }
      return apiClient.put(`/api/channels/${channelId}`, {
        ...audience,
        audience: newAudience,
      }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', channelId, 'audience'] })
      qc.invalidateQueries({ queryKey: ['channels', channelId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar audiência'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-fg">Perfil de audiência</h3>
        <p className="text-xs text-fg-3">Usado pelo Match para calcular fit produto → canal</p>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">
          Categorias de produto
          <span className="text-fg-3 ml-1">(separe por vírgula)</span>
        </label>
        <input
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          placeholder="suplementos, proteinas, vitaminas..."
          value={form.categories}
          onChange={e => set('categories', e.target.value)}
        />
        <p className="text-xs text-fg-3 mt-1">
          Produtos com estas categorias ganham +30pts no score
        </p>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">
          Marcas preferidas
          <span className="text-fg-3 ml-1">(separe por vírgula)</span>
        </label>
        <input
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          placeholder="Growth, Integral Medica, Xpro..."
          value={form.brands}
          onChange={e => set('brands', e.target.value)}
        />
        <p className="text-xs text-fg-3 mt-1">
          Produtos destas marcas ganham +20pts no score
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-fg-2 block mb-1">Drop mínimo (%)</label>
          <input
            type="number" min="0" max="100"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="10"
            value={form.min_drop}
            onChange={e => set('min_drop', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Preço mín (R$)</label>
          <input
            type="number" min="0"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="0"
            value={form.min_price}
            onChange={e => set('min_price', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Preço máx (R$)</label>
          <input
            type="number" min="0"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="9999"
            value={form.max_price}
            onChange={e => set('max_price', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Gênero predominante</label>
        <select
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
          value={form.gender}
          onChange={e => set('gender', e.target.value)}
        >
          <option value="">Não especificado</option>
          <option value="mix">Misto</option>
          <option value="m">Masculino</option>
          <option value="f">Feminino</option>
        </select>
      </div>

      <Button
        variant="primary"
        size="sm"
        loading={saveMut.isPending}
        onClick={() => saveMut.mutate()}
      >
        {saved ? '✓ Salvo!' : 'Salvar audiência'}
      </Button>

      {/* Preview do impacto no score */}
      {(form.categories || form.brands || form.min_drop) && (
        <div className="bg-surface-2 rounded-md p-3 text-xs text-fg-2">
          <p className="font-medium text-fg mb-1">Impacto no Match:</p>
          <p>Produtos {form.categories ? `de "${form.categories.split(',')[0].trim()}"` : 'de qualquer categoria'} com {form.min_drop ? `desconto ≥ ${form.min_drop}%` : 'qualquer desconto'} e preço {form.min_price || form.max_price ? `R$ ${form.min_price || 0}–${form.max_price || '∞'}` : 'qualquer'} terão score alto.</p>
        </div>
      )}
    </div>
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

// ── Aba: Regras (QUANDO X ENTÃO Y) ───────────────────────────────────────────

interface ChannelRule {
  id: number
  trigger: string
  action: string
  created_at?: string
}

const RULE_TRIGGERS = [
  { value: 'ctr_below_1pct', label: 'CTR abaixo de 1%' },
  { value: 'ctr_below_2pct', label: 'CTR abaixo de 2%' },
  { value: 'no_dispatch_3d', label: 'Sem disparo há 3 dias' },
  { value: 'no_dispatch_7d', label: 'Sem disparo há 7 dias' },
  { value: 'member_drop_10pct', label: 'Queda de membros ≥ 10%' },
  { value: 'engagement_drop', label: 'Queda de engajamento' },
]

const RULE_ACTIONS = [
  { value: 'notify_admin', label: 'Notificar administrador' },
  { value: 'pause_channel', label: 'Pausar canal' },
  { value: 'reduce_frequency', label: 'Reduzir frequência de disparos' },
  { value: 'increase_frequency', label: 'Aumentar frequência de disparos' },
  { value: 'flag_review', label: 'Marcar para revisão manual' },
]

function ChannelRules({ channelId }: { channelId: string }) {
  const qc = useQueryClient()
  const [showModal, setShowModal] = React.useState(false)
  const [form, setForm] = React.useState({ trigger: '', action: '' })

  const { data: rules = [], isLoading } = useQuery<ChannelRule[]>({
    queryKey: ['channels', channelId, 'rules'],
    queryFn: () =>
      apiClient
        .get(`/api/channels/${channelId}/rules`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    staleTime: 30_000,
  })

  const addMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/channels/${channelId}/rules`, {
          trigger: form.trigger,
          action: form.action,
        })
        .then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', channelId, 'rules'] })
      setShowModal(false)
      setForm({ trigger: '', action: '' })
    },
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Erro ao criar regra'),
  })

  const deleteMut = useMutation({
    mutationFn: (ruleId: number) =>
      apiClient.delete(`/api/channels/${channelId}/rules/${ruleId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['channels', channelId, 'rules'] }),
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Erro ao remover regra'),
  })

  const triggerLabel = (v: string) =>
    RULE_TRIGGERS.find(t => t.value === v)?.label ?? v
  const actionLabel = (v: string) =>
    RULE_ACTIONS.find(a => a.value === v)?.label ?? v

  return (
    <>
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-fg mb-4">Adicionar regra</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-fg-2 block mb-1">
                  QUANDO (gatilho)
                </label>
                <select
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                  value={form.trigger}
                  onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {RULE_TRIGGERS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-fg-2 block mb-1">
                  ENTÃO (ação)
                </label>
                <select
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                  value={form.action}
                  onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {RULE_ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={addMut.isPending}
                disabled={!form.trigger || !form.action}
                onClick={() => addMut.mutate()}
              >
                Criar regra
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-fg-2">
            Regras automáticas de resposta a eventos do canal
          </p>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            + Adicionar regra
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : rules.length === 0 ? (
          <div className="border border-border rounded-md p-6 text-center">
            <p className="text-sm text-fg-3 mb-1">Nenhuma regra configurada.</p>
            <p className="text-xs text-fg-3">
              Regras permitem automatizar ações quando condições são detectadas.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div
                key={rule.id}
                className="border border-border rounded-md p-4 flex items-start justify-between gap-4 bg-surface"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium bg-surface-2 text-fg-2 px-2 py-0.5 rounded">
                      QUANDO
                    </span>
                    <span className="text-sm text-fg">{triggerLabel(rule.trigger)}</span>
                    <span className="text-xs font-medium bg-surface-2 text-fg-2 px-2 py-0.5 rounded">
                      ENTÃO
                    </span>
                    <span className="text-sm text-fg">{actionLabel(rule.action)}</span>
                  </div>
                  {rule.created_at && (
                    <p className="text-xs text-fg-3 mt-1">
                      Criada em {new Date(rule.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs text-danger hover:underline shrink-0"
                  onClick={() => {
                    if (confirm('Remover esta regra?')) deleteMut.mutate(rule.id)
                  }}
                >
                  Remover
                </button>
              </div>
            ))}
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

// ── Aba: Link público (placeholder) ──────────────────────────────────────────

function ChannelPublicLink({ channelId }: { channelId: string }) {
  return (
    <div className="max-w-lg">
      <p className="text-sm text-fg-2 mb-4">
        Link público de afiliado para este canal. Compartilhe para rastrear conversões
        atribuídas a este canal de forma independente.
      </p>
      <div className="border border-border rounded-md p-6 bg-surface-2 text-center">
        <p className="text-sm font-medium text-fg mb-1">Em breve</p>
        <p className="text-xs text-fg-3">
          A geração de links públicos de afiliado por canal está em desenvolvimento.
        </p>
        <p className="text-xs text-fg-3 mt-1">
          ID do canal: <span className="font-mono text-accent">{channelId}</span>
        </p>
      </div>
    </div>
  )
}

// ── Bar chart 7 dias ──────────────────────────────────────────────────────────

interface DayPoint { day: string; value: number }

function buildMock7d(): DayPoint[] {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  return days.map((day, i) => ({ day, value: 20 + Math.round(Math.sin(i * 0.9) * 15 + Math.random() * 10) }))
}

function DisparoChart({ metrics }: { metrics: any }) {
  const data: DayPoint[] = React.useMemo(() => {
    if (metrics?.dispatches_7d_series && Array.isArray(metrics.dispatches_7d_series)) {
      return (metrics.dispatches_7d_series as { day: string; value: number }[]).map(p => ({
        day: p.day,
        value: p.value,
      }))
    }
    return buildMock7d()
  }, [metrics])

  return (
    <div className="border border-border rounded-md p-4 bg-surface">
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">
        Disparos — últimos 7 dias
      </p>
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
          <ChannelRules channelId={id!} />
        )}

        {tab === 'history' && (
          <ChannelHistory channelId={id!} />
        )}

        {tab === 'publiclink' && (
          <ChannelPublicLink channelId={id!} />
        )}
      </div>
    </div>
  )
}
