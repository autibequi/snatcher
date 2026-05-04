import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Input, Modal, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface RedesignGroup {
  id: number
  name: string
  platform: string
  status: string
  member_count: number
  invite_link?: { String: string; Valid: boolean }
  channel_id: number
  created_at: string
  last_message_at?: { Time: string; Valid: boolean }
}

interface Channel {
  id: number
  name: string
}

interface Account {
  id: number
  name?: string
  phone?: string
  role: string
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  paused: 'warning',
  banned: 'danger',
  full: 'default',
}

const INVITE_LINK_RE = /chat\.whatsapp\.com\/.+|t\.me\/.+/

interface GroupFormData {
  channel_id: string
  name: string
  platform: string
  account_id: string
  invite_link: string
}

const defaultGroupForm: GroupFormData = {
  channel_id: '',
  name: '',
  platform: 'wa',
  account_id: '',
  invite_link: '',
}

function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<GroupFormData>(defaultGroupForm)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () =>
      apiClient.get('/api/channels').then(r =>
        Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
      ).catch(() => []),
    enabled: open,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'wa', 'sender'],
    queryFn: () =>
      apiClient.get('/api/accounts/wa?role=sender').then(r =>
        Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
      ).catch(() => []),
    enabled: open,
  })

  const createMut = useMutation({
    mutationFn: (data: object) =>
      apiClient.post('/api/groups', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      onClose()
      setForm(defaultGroupForm)
      setErrors({})
      alert('Grupo adicionado com sucesso!')
    },
    onError: () => {
      alert('Erro ao adicionar grupo. Verifique os dados e tente novamente.')
    },
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.channel_id) errs.channel_id = 'Canal é obrigatório'
    if (!form.name.trim()) errs.name = 'Nome é obrigatório'
    if (!form.platform) errs.platform = 'Plataforma é obrigatória'
    if (form.invite_link.trim() && !INVITE_LINK_RE.test(form.invite_link.trim())) {
      errs.invite_link = 'Link inválido. Use chat.whatsapp.com/... ou t.me/...'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!validate()) return

    // Backend espera platform 'whatsapp'|'telegram' e wa_account_id/tg_account_id separados
    const platformFull = form.platform === 'wa' ? 'whatsapp' : form.platform === 'tg' ? 'telegram' : form.platform
    const accId = form.account_id ? Number(form.account_id) : undefined
    const payload: Record<string, unknown> = {
      channel_id: Number(form.channel_id),
      name: form.name.trim(),
      platform: platformFull,
      wa_account_id: platformFull === 'whatsapp' ? accId : undefined,
      tg_account_id: platformFull === 'telegram' ? accId : undefined,
      invite_link: form.invite_link.trim() || '',
    }

    createMut.mutate(payload)
  }

  function handleClose() {
    onClose()
    setForm(defaultGroupForm)
    setErrors({})
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Adicionar grupo"
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
            Adicionar grupo
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Canal *</label>
          <select
            value={form.channel_id}
            onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))}
            className={`w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.channel_id ? 'border-danger' : ''}`}
          >
            <option value="">Selecione um canal</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
          {errors.channel_id && <p className="text-xs text-danger">{errors.channel_id}</p>}
        </div>

        <Input
          label="Nome do grupo *"
          placeholder="Ex: Ofertas Tech BR"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          error={errors.name}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Plataforma *</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            className={`w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.platform ? 'border-danger' : ''}`}
          >
            <option value="wa">WhatsApp</option>
            <option value="tg">Telegram</option>
          </select>
          {errors.platform && <p className="text-xs text-danger">{errors.platform}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Conta remetente</label>
          <select
            value={form.account_id}
            onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
            className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Sem conta específica</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name || a.phone || `Conta #${a.id}`}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Link de convite"
          placeholder="https://chat.whatsapp.com/... ou https://t.me/..."
          value={form.invite_link}
          onChange={e => setForm(f => ({ ...f, invite_link: e.target.value }))}
          error={errors.invite_link}
        />
      </form>
    </Modal>
  )
}

export default function Groups() {
  const navigate = useNavigate()
  const [platform, setPlatform] = React.useState('')
  const [showModal, setShowModal] = React.useState(false)

  const { data: groups = [], isLoading } = useQuery<RedesignGroup[]>({
    queryKey: ['groups', platform],
    queryFn: () =>
      apiClient
        .get(`/api/groups${platform ? `?platform=${platform}` : ''}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Grupos</h1>
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
          + Adicionar grupo
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {['', 'whatsapp', 'telegram'].map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
              platform === p
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-fg-2 hover:bg-border'
            }`}
          >
            {p || 'Todos'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !groups.length ? (
        <EmptyState
          title="Nenhum grupo"
          description="Adicione grupos de WhatsApp ou Telegram para enviar promoções."
          cta={{ label: 'Adicionar grupo', onClick: () => setShowModal(true) }}
        />
      ) : (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Nome', 'Plataforma', 'Status', 'Membros', 'Ultimo disparo'].map(h => (
                  <th key={h} className="text-left p-3 text-fg-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                >
                  <td className="p-3 font-medium text-fg">{g.name}</td>
                  <td className="p-3">
                    <Badge size="sm">{g.platform}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={statusVariant[g.status] ?? 'default'} size="sm">
                      {g.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-fg-2">{g.member_count}</td>
                  <td className="p-3 text-fg-3 text-xs">
                    {g.last_message_at?.Valid
                      ? new Date(g.last_message_at.Time).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateGroupModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  )
}
