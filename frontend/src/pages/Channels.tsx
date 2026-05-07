import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, ResponsiveContainer } from 'recharts'
import { Badge, Button, Input, Modal, Skeleton, Switch } from '../components/ui'
import { apiClient } from '../lib/apiClient'

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

function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}


// ── Inline mini bar-chart ─────────────────────────────────────────────────────
function ChannelMiniChart({ channelId, series }: { channelId: number; series?: number[] }) {
  // try to fetch metrics; fallback to passed series or mock
  const { data: metricsData } = useQuery<{ dispatches_7d_series?: number[] }>({
    queryKey: ['channel-metrics', channelId],
    queryFn: () =>
      apiClient
        .get(`/api/channels/${channelId}/metrics`)
        .then(r => r.data)
        .catch(() => ({})),
    staleTime: 5 * 60_000,
    enabled: !series,
  })

  const raw = series ?? metricsData?.dispatches_7d_series ?? []
  const chartData = raw.map((v, i) => ({ day: i, v }))

  return (
    <div className="w-full h-10">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barSize={4} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Bar dataKey="v" fill="var(--color-accent, #6366f1)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

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

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Descrição</label>
          <textarea
            placeholder="Descreva o foco deste canal..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-surface text-fg placeholder:text-fg-3 border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

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

// ── Status border color ───────────────────────────────────────────────────────
function statusBorderClass(channel: Channel): string {
  // warning heuristic: member_count 0 or very low ctr
  if (!channel.active) return 'border-l-4 border-l-neutral-500'
  if (channel.member_count !== undefined && channel.member_count < 5) return 'border-l-4 border-l-yellow-500'
  return 'border-l-4 border-l-green-500'
}

function ChannelCard({ channel, onClick, index }: { channel: Channel; onClick: () => void; index: number }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-border rounded-md p-4 hover:border-border-strong cursor-pointer transition-colors flex flex-col gap-2 ${statusBorderClass(channel)}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <p className="font-medium text-fg">{channel.name}</p>
          {channel.platform && (
            <Badge size="sm" variant={channel.platform === 'whatsapp' ? 'success' : 'accent'}>
              {channel.platform === 'whatsapp' ? 'WA' : 'TG'}
            </Badge>
          )}
        </div>
        <Badge variant={channel.active ? 'success' : 'default'}>
          {channel.active ? 'ativo' : 'inativo'}
        </Badge>
      </div>

      {/* Description */}
      {channel.description && (
        <p className="text-xs text-fg-3 line-clamp-1">{channel.description}</p>
      )}

      {/* Mini bar-chart — dispatches 7d */}
      <ChannelMiniChart channelId={channel.id} series={channel.dispatches_7d_series} />
      <p className="text-[10px] text-fg-3 -mt-1">Disparos 7d</p>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 mt-1">
        <div>
          <p className="text-xs text-fg-3">Membros</p>
          <p className="text-sm font-medium text-fg">{channel.member_count ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-fg-3">CTR 30d</p>
          <p className="text-sm font-medium text-fg">{channel.ctr_30d ? `${(channel.ctr_30d * 100).toFixed(1)}%` : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-fg-3">Receita 30d</p>
          <p className="text-sm font-medium text-fg">{channel.revenue_30d ? `R$ ${channel.revenue_30d.toFixed(0)}` : '—'}</p>
        </div>
      </div>

      {/* Tags */}
      {channel.audience?.categories?.length ? (
        <div className="flex gap-1 flex-wrap">
          {channel.audience.categories.slice(0, 3).map(c => (
            <Badge key={c} size="sm" variant="accent">{c}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Placeholder card "+ Novo canal" ──────────────────────────────────────────
function NewChannelPlaceholder({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface border-2 border-dashed border-border rounded-md p-4 hover:border-accent hover:bg-accent/5 transition-colors flex flex-col items-center justify-center gap-2 min-h-[160px] w-full cursor-pointer"
    >
      <span className="text-3xl text-fg-3">+</span>
      <span className="text-sm text-fg-3 font-medium">Novo canal</span>
    </button>
  )
}

export default function Channels() {
  const navigate = useNavigate()
  const [showModal, setShowModal] = React.useState(false)

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => apiClient.get('/api/channels').then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-end mb-4">
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
          + Novo canal
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:6}).map((_,i) => <Skeleton key={i} variant="card" className="h-36" />)}
        </div>
      ) : !channels.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NewChannelPlaceholder onClick={() => setShowModal(true)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch, i) => (
            <ChannelCard key={ch.id} channel={ch} onClick={() => navigate(`/channels/${ch.id}`)} index={i} />
          ))}
          <NewChannelPlaceholder onClick={() => setShowModal(true)} />
        </div>
      )}

      <CreateChannelModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  )
}
