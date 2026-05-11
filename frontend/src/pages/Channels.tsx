import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PlatformPill,
  SearchSelect,
  SkeletonTable,
  Switch,
  Textarea,
} from '../components/ui'
import { apiClient } from '../lib/apiClient'
import {
  filterBar,
  pageContainer,
  tableContainer,
  tableHeaderCell,
  tableRow,
  tableCell,
  tableCellMuted,
} from '../lib/uiTokens'

// ── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: number
  name: string
  description?: string
  active: boolean
  platform?: string
  member_count?: number
  ctr_30d?: number
  cvr_30d?: number
  revenue_30d?: number
  dispatches_7d_series?: number[]
  audience?: {
    categories?: string[]
    min_drop?: number
  }
}

interface ChannelFormData {
  name: string
  description: string
  active: boolean
  audience: {
    categories: string
    brands: string
    min_drop: string
    min_price: string
    max_price: string
    gender: string
  }
}

interface ChannelSuggestion {
  name: string
  description: string
  audience_categories: string[]
  audience_brands: string[]
  audience_min_price: number
  audience_max_price: number
  audience_min_drop: number
  send_start_hour: number
  send_end_hour: number
  digest_mode: boolean
  rationale: string
  target_profile: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const defaultForm: ChannelFormData = {
  name: '',
  description: '',
  active: true,
  audience: {
    categories: '',
    brands: '',
    min_drop: '',
    min_price: '',
    max_price: '',
    gender: '',
  },
}

const PLATFORM_OPTIONS = [
  { value: 'wa', label: 'WhatsApp' },
  { value: 'tg', label: 'Telegram' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'paused', label: 'Inativo' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function fmtCtr(v: number | undefined): string {
  if (v === undefined || v === null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function fmtRevenue(v: number | undefined): string {
  if (v === undefined || v === null || v === 0) return '—'
  return `R$ ${v.toFixed(0)}`
}

function fmtCount(v: number | undefined): string {
  if (v === undefined || v === null) return '0'
  return String(v)
}

// ── Channel table row ─────────────────────────────────────────────────────────

function ChannelRow({ channel, onClick }: { channel: Channel; onClick: () => void }) {
  const statusBadge = channel.active ? (
    <Badge variant="success" size="sm">ativo</Badge>
  ) : (
    <Badge variant="default" size="sm">inativo</Badge>
  )

  return (
    <tr
      className={`${tableRow} cursor-pointer`}
      onClick={onClick}
    >
      {/* Name + description */}
      <td className={tableCell}>
        <p className="font-medium text-fg">{channel.name}</p>
        {channel.description && (
          <p className="text-xs text-fg-3 mt-0.5 line-clamp-1 max-w-xs">{channel.description}</p>
        )}
      </td>

      {/* Status */}
      <td className={tableCell}>{statusBadge}</td>

      {/* Groups / members */}
      <td className={`${tableCell} tabular-nums`}>
        {fmtCount(channel.member_count)}
      </td>

      {/* CTR 30d */}
      <td className={`${tableCellMuted} tabular-nums`}>
        {fmtCtr(channel.ctr_30d)}
      </td>

      {/* Revenue 30d */}
      <td className={`${tableCellMuted} tabular-nums`}>
        {fmtRevenue(channel.revenue_30d)}
      </td>

      {/* Audience tags */}
      <td className={tableCell}>
        {channel.audience?.categories?.length ? (
          <div className="flex gap-1 flex-wrap">
            {channel.audience.categories.slice(0, 3).map(c => (
              <Badge key={c} size="sm" variant="accent">{c}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-fg-3">—</span>
        )}
      </td>
    </tr>
  )
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<ChannelFormData>(defaultForm)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const createMut = useMutation({
    mutationFn: (data: object) =>
      apiClient.post('/api/channels', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      onClose()
      setForm(defaultForm)
      setErrors({})
      alert('Canal criado com sucesso!')
    },
    onError: () => {
      alert('Erro ao criar canal. Verifique os dados e tente novamente.')
    },
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Nome é obrigatório'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!validate()) return

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      active: form.active,
      audience: {
        categories: parseTagList(form.audience.categories),
        brands: parseTagList(form.audience.brands),
        min_drop: form.audience.min_drop ? Number(form.audience.min_drop) : undefined,
        min_price: form.audience.min_price ? Number(form.audience.min_price) : undefined,
        max_price: form.audience.max_price ? Number(form.audience.max_price) : undefined,
        gender: form.audience.gender || undefined,
      },
    }

    createMut.mutate(payload)
  }

  function setAudience(field: keyof ChannelFormData['audience'], value: string) {
    setForm(f => ({ ...f, audience: { ...f.audience, [field]: value } }))
  }

  function handleClose() {
    onClose()
    setForm(defaultForm)
    setErrors({})
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo canal"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={createMut.isPending}
            onClick={handleSubmit}
          >
            Criar canal
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome *"
          placeholder="Ex: Eletrônicos Premium"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          error={errors.name}
        />

        <Textarea
          label="Descrição"
          placeholder="Descreva o foco deste canal..."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
        />

        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold text-fg-2 mb-3 uppercase tracking-wide">Público-alvo</p>
          <div className="space-y-3">
            <Input
              label="Categorias (separadas por vírgula)"
              placeholder="Ex: eletrônicos, celulares, tablets"
              value={form.audience.categories}
              onChange={e => setAudience('categories', e.target.value)}
            />
            <Input
              label="Marcas (separadas por vírgula)"
              placeholder="Ex: Samsung, Apple, Xiaomi"
              value={form.audience.brands}
              onChange={e => setAudience('brands', e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Drop mínimo (%)"
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={form.audience.min_drop}
                onChange={e => setAudience('min_drop', e.target.value)}
              />
              <Input
                label="Preço mín (R$)"
                type="number"
                min={0}
                placeholder="0"
                value={form.audience.min_price}
                onChange={e => setAudience('min_price', e.target.value)}
              />
              <Input
                label="Preço máx (R$)"
                type="number"
                min={0}
                placeholder="9999"
                value={form.audience.max_price}
                onChange={e => setAudience('max_price', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-fg-2">Gênero</label>
              <select
                value={form.audience.gender}
                onChange={e => setAudience('gender', e.target.value)}
                className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Qualquer</option>
                <option value="m">Masculino</option>
                <option value="f">Feminino</option>
                <option value="mix">Misto</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Switch
            checked={form.active}
            onChange={v => setForm(f => ({ ...f, active: v }))}
          />
          <span className="text-sm text-fg">Canal ativo</span>
        </div>
      </form>
    </Modal>
  )
}

// ── Suggest modal ─────────────────────────────────────────────────────────────

export function SuggestChannelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [intent, setIntent] = React.useState('')
  const [mode, setMode] = React.useState<'' | 'next' | 'expand'>('')
  const [suggestion, setSuggestion] = React.useState<ChannelSuggestion | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleSuggest = async () => {
    setLoading(true)
    setError('')
    setSuggestion(null)
    try {
      const res = await apiClient.post(
        '/api/channels/suggest',
        { intent, mode },
        { timeout: 90_000 },
      )
      setSuggestion(res.data.suggestion)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e?.response?.data?.error ?? e?.message ?? 'Erro ao consultar LLM')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!suggestion) return
    setCreating(true)
    try {
      await apiClient.post('/api/channels', {
        name: suggestion.name,
        description: suggestion.description,
        send_start_hour: suggestion.send_start_hour,
        send_end_hour: suggestion.send_end_hour,
        digest_mode: suggestion.digest_mode,
        active: true,
        audience: {
          categories: suggestion.audience_categories,
          brands: suggestion.audience_brands,
          min_price: suggestion.audience_min_price,
          max_price: suggestion.audience_max_price,
          min_drop: suggestion.audience_min_drop,
        },
      })
      onCreated()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e?.response?.data?.error ?? 'Erro ao criar canal')
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-6 w-full max-w-lg shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg">Sugerir canal com IA</h3>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg text-lg">
            x
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <Textarea
            label="Que audiência você quer alcançar? (opcional)"
            value={intent}
            onChange={e => setIntent(e.target.value)}
            rows={2}
            placeholder="ex: mães com filhos pequenos em SP, gamers que buscam promoções, homens 25-40 fitness..."
          />
          <div>
            <label className="text-xs text-fg-2 block mb-1">Estratégia</label>
            <div className="flex gap-2">
              {(
                [
                  ['', 'Auto'],
                  ['next', 'Proximo'],
                  ['expand', 'Nova audiencia'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m as '' | 'next' | 'expand')}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                    mode === m
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-fg-2 hover:bg-surface-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          className="w-full mb-4"
          onClick={handleSuggest}
          disabled={loading}
          loading={loading}
        >
          {loading ? 'Consultando IA com produtos e canais atuais...' : 'Gerar sugestao'}
        </Button>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}

        {suggestion && (
          <div className="border border-border rounded-md p-4 space-y-3 bg-surface-2">
            <div className="bg-accent/5 border border-accent/20 rounded p-3">
              <p className="text-sm font-semibold text-fg">{suggestion.name}</p>
              <p className="text-xs text-fg-3 mt-0.5">{suggestion.description}</p>
              <p className="text-xs text-accent mt-1 italic">{suggestion.target_profile}</p>
            </div>
            <div className="text-sm text-fg-2">{suggestion.rationale}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-fg-2 mb-0.5">Categorias</p>
                <p className="font-mono text-fg">
                  {(suggestion.audience_categories || []).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Marcas preferidas</p>
                <p className="font-mono text-fg">
                  {(suggestion.audience_brands || []).join(', ') || 'todas'}
                </p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Faixa de preço</p>
                <p className="font-mono text-fg">
                  {suggestion.audience_min_price > 0
                    ? `R$ ${suggestion.audience_min_price}`
                    : 'sem min'}{' '}
                  —{' '}
                  {suggestion.audience_max_price > 0
                    ? `R$ ${suggestion.audience_max_price}`
                    : 'sem max'}
                </p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Desconto mínimo</p>
                <p className="font-mono text-fg">{suggestion.audience_min_drop}%</p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Horário de envio</p>
                <p className="font-mono text-fg">
                  {suggestion.send_start_hour}h – {suggestion.send_end_hour}h
                </p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Modo</p>
                <p className="font-mono text-fg">
                  {suggestion.digest_mode ? 'digest diário' : 'envio imediato'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setSuggestion(null)
                  setError('')
                }}
                className="flex-1 text-sm px-3 py-1.5 border border-border rounded-md text-fg-2 hover:bg-surface"
              >
                Gerar nova
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 text-sm bg-success text-white rounded-md px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
              >
                {creating ? 'Criando...' : '+ Criar canal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Channels() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = React.useState(false)
  const [showSuggestModal, setShowSuggestModal] = React.useState(false)
  const [filterPlatform, setFilterPlatform] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState('')
  const [search, setSearch] = React.useState('')

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () =>
      apiClient
        .get('/api/channels')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? []))),
  })

  const filtered = React.useMemo(() => {
    return channels.filter(ch => {
      if (filterPlatform && ch.platform !== filterPlatform) return false
      if (filterStatus === 'active' && !ch.active) return false
      if (filterStatus === 'paused' && ch.active) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!ch.name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [channels, filterPlatform, filterStatus, search])

  return (
    <div className={pageContainer}>
      {/* Page header */}
      <PageHeader
        title="Canais"
        subtitle="Publicos logicos por audiencia"
        className="mb-4"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowSuggestModal(true)}>
              Sugerir canal
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
              + Novo canal
            </Button>
          </>
        }
      />

      {/* Sticky filter bar */}
      <div className={`${filterBar} -mx-3 sm:-mx-4 mb-4`}>
        <SearchSelect
          options={PLATFORM_OPTIONS}
          value={filterPlatform}
          onChange={setFilterPlatform}
          placeholder="Plataforma"
        />
        <SearchSelect
          options={STATUS_OPTIONS}
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="Status"
        />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar canal..."
          className="text-sm border border-border rounded-md px-2.5 py-1 bg-surface text-fg h-8 focus:outline-none focus:border-accent min-w-[160px] max-w-[220px]"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={tableContainer}>
          <div className="px-4 py-3">
            <SkeletonTable rows={6} />
          </div>
        </div>
      ) : !channels.length ? (
        <EmptyState
          title="Nenhum canal criado"
          description="Crie seu primeiro canal para comecar a distribuir produtos por audiencia."
          cta={{ label: '+ Novo canal', onClick: () => setShowModal(true) }}
        />
      ) : !filtered.length ? (
        <EmptyState
          title="Nenhum canal encontrado"
          description="Tente outros filtros ou termos de busca."
        />
      ) : (
        <div className={tableContainer}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className={`${tableHeaderCell} w-[30%]`}>Canal</th>
                <th className={tableHeaderCell}>Status</th>
                <th className={tableHeaderCell}>Grupos</th>
                <th className={tableHeaderCell}>CTR 30d</th>
                <th className={tableHeaderCell}>Receita 30d</th>
                <th className={tableHeaderCell}>Categorias</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ch => (
                <ChannelRow
                  key={ch.id}
                  channel={ch}
                  onClick={() => navigate(`/channels/${ch.id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateChannelModal open={showModal} onClose={() => setShowModal(false)} />
      {showSuggestModal && (
        <SuggestChannelModal
          onClose={() => setShowSuggestModal(false)}
          onCreated={() => {
            setShowSuggestModal(false)
            qc.invalidateQueries({ queryKey: ['channels'] })
          }}
        />
      )}
    </div>
  )
}
