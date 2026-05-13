import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Input, Modal, Skeleton, EmptyState, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { relativeTime } from './MarketplaceTab'
import { MessagePreview } from '../../components/MessagePreview'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SenderAccount {
  id: number
  phone: string
  modem_id: number
  modem_slug: string
  status: string
  daily_send_quota: number
  last_sent_at: string | null
  consecutive_failures: number
  sent_today: number
}

export interface SpyGroup {
  id: number
  group_name: string
  platform: string
  active: boolean
  invite_link?: string
  reader_wa_id?: number
  stealth_mode?: boolean
  categories?: string[]
  capture_count?: number
  last_capture_at?: string
}

interface SpyMessage {
  id: number
  sender?: string
  text?: string
  media_url?: string
  collected_at: string
}

// ── CreateSpyModal ────────────────────────────────────────────────────────────

interface SpyFormData {
  group_name: string
  platform: string
  invite_link: string
  reader_account_id: string
}

const defaultSpyForm: SpyFormData = {
  group_name: '',
  platform: 'whatsapp',
  invite_link: '',
  reader_account_id: '',
}

export function CreateSpyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<SpyFormData>(defaultSpyForm)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const { data: accounts = [] } = useQuery<SenderAccount[]>({
    queryKey: ['accounts', 'senders', 'reader'],
    queryFn: () =>
      apiClient.get<SenderAccount[]>('/api/admin/senders/accounts')
        .then(r => (Array.isArray(r.data) ? r.data : []).filter(a => a.status !== 'banned'))
        .catch(() => []),
    enabled: open,
  })

  const createMut = useMutation({
    mutationFn: (data: object) =>
      apiClient.post('/api/crawlers/group-spy', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crawlers', 'group-spy'] })
      onClose()
      setForm(defaultSpyForm)
      setErrors({})
      alert('Grupo adicionado para espionagem!')
    },
    onError: () => {
      alert('Erro ao adicionar grupo. Verifique os dados e tente novamente.')
    },
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.group_name.trim()) errs.group_name = 'Nome do grupo e obrigatorio'
    if (!form.platform) errs.platform = 'Plataforma e obrigatoria'
    if (!form.invite_link.trim()) errs.invite_link = 'Link de convite e obrigatorio'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!validate()) return
    const payload: Record<string, unknown> = {
      group_name: form.group_name.trim(),
      platform: form.platform,
      invite_link: form.invite_link.trim() || '',
      reader_wa_id: form.reader_account_id ? Number(form.reader_account_id) : null,
    }
    createMut.mutate(payload)
  }

  function handleClose() {
    onClose()
    setForm(defaultSpyForm)
    setErrors({})
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Adicionar grupo a espionar"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={createMut.isPending} onClick={handleSubmit}>
            Adicionar
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome do grupo *"
          placeholder="Ex: Concorrente Ofertas BR"
          value={form.group_name}
          onChange={e => setForm(f => ({ ...f, group_name: e.target.value }))}
          error={errors.group_name}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Plataforma *</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            className={`w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.platform ? 'border-danger' : ''}`}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
          {errors.platform && <p className="text-xs text-danger">{errors.platform}</p>}
        </div>
        <Input
          label="Link de convite"
          placeholder="https://chat.whatsapp.com/..."
          value={form.invite_link}
          onChange={e => setForm(f => ({ ...f, invite_link: e.target.value }))}
          error={errors.invite_link}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Conta leitora</label>
          <select
            value={form.reader_account_id}
            onChange={e => setForm(f => ({ ...f, reader_account_id: e.target.value }))}
            className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Sem conta especifica</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.phone || `Conta #${a.id}`}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  )
}

// ── ChangeReaderModal ─────────────────────────────────────────────────────────

function ChangeReaderModal({ spy, onClose }: { spy: SpyGroup; onClose: () => void }) {
  const qc = useQueryClient()
  const [readerId, setReaderId] = React.useState<string>(String(spy.reader_wa_id ?? ''))

  const { data: accounts = [] } = useQuery<SenderAccount[]>({
    queryKey: ['accounts', 'senders', 'reader'],
    queryFn: () =>
      apiClient.get<SenderAccount[]>('/api/admin/senders/accounts')
        .then(r => (Array.isArray(r.data) ? r.data : []).filter(a => a.status !== 'banned'))
        .catch(() => []),
  })

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/crawlers/group-spy/${spy.id}`, {
        reader_wa_id: readerId ? Number(readerId) : null,
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crawlers', 'group-spy'] })
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Trocar conta leitora"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-2">
          Selecione a conta que vai ler as mensagens de <strong className="text-fg">{spy.group_name}</strong>.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Conta leitora</label>
          <select
            value={readerId}
            onChange={e => setReaderId(e.target.value)}
            className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Sem conta especifica</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.phone || `Conta #${a.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ── SpyGroupDetail ────────────────────────────────────────────────────────────

function SpyGroupDetail({
  spy,
  onClose,
  onChangeReader,
}: {
  spy: SpyGroup
  onClose: () => void
  onChangeReader: () => void
}) {
  const { data: messages = [], isLoading } = useQuery<SpyMessage[]>({
    queryKey: ['spy-messages', spy.id],
    queryFn: () =>
      apiClient.get(`/api/crawlers/group-spy/${spy.id}/messages`).then(r =>
        Array.isArray(r.data) ? r.data : []
      ).catch(() => []),
    refetchInterval: 30_000,
  })

  const now = Date.now()
  const msgs24h = messages.filter(m => now - new Date(m.collected_at).getTime() < 86_400_000).length
  const categories: string[] = spy.categories ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h3 className="font-semibold text-fg">{spy.group_name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-fg-3">{spy.platform}</p>
            {spy.stealth_mode && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                stealth
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={spy.active ? 'success' : 'default'} size="sm">
            {spy.active ? 'ativo' : 'parado'}
          </Badge>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg p-1 rounded text-sm">x</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border flex-shrink-0">
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Msgs 24h</p>
          <p className="text-lg font-semibold text-fg">{msgs24h}</p>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Capturas</p>
          <p className="text-lg font-semibold text-fg">{spy.capture_count ?? messages.length}</p>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Aproveitamento</p>
          <p className="text-lg font-semibold text-fg">
            {messages.length > 0 ? `${Math.round((msgs24h / Math.max(messages.length, 1)) * 100)}%` : '—'}
          </p>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Ultima captura</p>
          <p className="text-sm font-medium text-fg">
            {spy.last_capture_at
              ? relativeTime(spy.last_capture_at)
              : messages.length > 0
                ? relativeTime(messages[0]?.collected_at)
                : '—'}
          </p>
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <p className="text-xs text-fg-3 mb-2">Categorias detectadas</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <Badge key={c} variant="accent" size="sm">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 border-b border-border flex-shrink-0">
        <Button variant="secondary" size="sm" onClick={onChangeReader}>
          Trocar conta leitora
        </Button>
      </div>

      {/* Capturas recentes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Capturas recentes</p>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 space-y-1">
            <p className="text-sm text-fg-2">Nenhuma mensagem coletada ainda.</p>
            <p className="text-xs text-fg-3">O sistema coleta automaticamente as postagens do grupo enquanto o spy estiver ativo.</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className="bg-surface-2 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-accent">{m.sender || 'desconhecido'}</p>
                <p className="text-xs text-fg-3">{new Date(m.collected_at).toLocaleString('pt-BR')}</p>
              </div>
              <MessagePreview text={m.text} mediaUrl={m.media_url} variant="inline" maxHeight={200} />
            </div>
          ))
        )}
      </div>

      {/* Invite link */}
      {spy.invite_link && (
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <a
            href={spy.invite_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline truncate block"
          >
            {spy.invite_link}
          </a>
        </div>
      )}
    </div>
  )
}

// ── GroupSpyTab ───────────────────────────────────────────────────────────────

export function GroupSpyTab({ onNew }: { onNew: () => void }) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [showChangeReaderModal, setShowChangeReaderModal] = React.useState(false)

  const { data: spies = [], isLoading } = useQuery<SpyGroup[]>({
    queryKey: ['crawlers', 'group-spy'],
    queryFn: () =>
      apiClient.get('/api/crawlers/group-spy').then(r =>
        Array.isArray(r.data) ? r.data : []
      ).catch(() => []),
  })

  const selectedSpy = spies.find(s => s.id === selectedId) ?? null

  if (isLoading) return (
    <div className="p-4">
      <Skeleton className="h-24 w-full" />
    </div>
  )

  if (!spies.length) return (
    <div className="p-4">
      <EmptyState
        title="Nenhum grupo espionado"
        description="Adicione grupos concorrentes para extrair produtos automaticamente."
        cta={{ label: 'Adicionar grupo', onClick: onNew }}
      />
    </div>
  )

  return (
    <div className="flex h-[600px]">
      {/* Left: compact list */}
      <div className={`flex flex-col border-r border-border overflow-y-auto ${selectedSpy ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
        <div className="p-3 border-b border-border flex-shrink-0">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">
            {spies.length} grupo{spies.length !== 1 ? 's' : ''}
          </p>
        </div>
        {spies.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedId(prev => prev === s.id ? null : s.id)}
            className={`flex items-center gap-3 px-3 py-3 text-left border-b border-border last:border-0 transition-colors w-full ${
              selectedId === s.id
                ? 'bg-accent/5 border-l-2 border-l-accent'
                : 'hover:bg-surface-2'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
              s.platform === 'telegram'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                : 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
            }`}>
              {s.platform === 'telegram' ? 'TG' : 'WA'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg truncate">{s.group_name}</p>
              <p className="text-xs text-fg-3">{s.platform}</p>
            </div>
            <Badge variant={s.active ? 'success' : 'default'} size="sm">
              {s.active ? 'ativo' : 'parado'}
            </Badge>
          </button>
        ))}
      </div>

      {/* Right: detail panel */}
      {selectedSpy ? (
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <SpyGroupDetail
            spy={selectedSpy}
            onClose={() => setSelectedId(null)}
            onChangeReader={() => setShowChangeReaderModal(true)}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-fg-3 text-sm">
          <p>Selecione um grupo para ver detalhes</p>
        </div>
      )}

      {showChangeReaderModal && selectedSpy && (
        <ChangeReaderModal
          spy={selectedSpy}
          onClose={() => setShowChangeReaderModal(false)}
        />
      )}
    </div>
  )
}

// ── EditSpyModal (inline toggle activate/deactivate) ──────────────────────────

export function EditSpyModal({ spy, onClose }: { spy: SpyGroup | null; onClose: () => void }) {
  const qc = useQueryClient()

  const toggleMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/crawlers/group-spy/${spy!.id}`, { active: !spy!.active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crawlers', 'group-spy'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao atualizar'),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/crawlers/group-spy/${spy!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crawlers', 'group-spy'] }); onClose() },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao excluir'),
  })

  if (!spy) return null

  return (
    <Modal open onClose={onClose} title="Grupo concorrente" footer={
      <div className="flex items-center justify-between w-full gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={deleteMut.isPending}
          onClick={() => {
            if (confirm(`Remover "${spy.group_name}"?`)) deleteMut.mutate()
          }}
        >
          Remover
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Fechar</Button>
          <Button
            variant={spy.active ? 'secondary' : 'primary'}
            size="sm"
            loading={toggleMut.isPending}
            onClick={() => toggleMut.mutate()}
          >
            {spy.active ? 'Pausar' : 'Ativar'}
          </Button>
        </div>
      </div>
    }>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch checked={spy.active} onChange={() => toggleMut.mutate()} />
          <span className="text-sm text-fg">{spy.active ? 'Ativo' : 'Pausado'}</span>
        </div>
        {spy.invite_link && (
          <div>
            <p className="text-xs text-fg-2 mb-1">Link de convite</p>
            <a href={spy.invite_link} target="_blank" rel="noopener noreferrer"
              className="text-xs text-accent hover:underline truncate block">
              {spy.invite_link}
            </a>
          </div>
        )}
      </div>
    </Modal>
  )
}
