import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Input, Skeleton, EmptyState, Tabs } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

interface WAAccount {
  id: number
  name: string
  provider: string
  status: string
  role: string
  daily_limit: number
  sent_today: number
  active: boolean
  base_url?: { String: string; Valid: boolean }
}

interface TGAccount {
  id: number
  name: string
  bot_username?: { String: string; Valid: boolean }
  active: boolean
  role: string
  daily_limit: number
  sent_today: number
}

interface QRData {
  qr_code?: string
  base64?: string
}

interface StatusData {
  status: string
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  connected: 'success',
  qr_pending: 'warning',
  scanning: 'warning',   // SCAN_QR_CODE → aguardando scan
  disconnected: 'default',
  stopped: 'default',
  banned: 'danger',
}

// ── Modal primitivo (sem dependência externa) ──────────────────────────────────
function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className={`bg-surface border border-border rounded-lg shadow-xl w-full ${maxWidth} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-3 hover:text-fg transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Modal de confirmação de exclusão ──────────────────────────────────────────
function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  accountName,
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  accountName: string
  loading: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title="Confirmar exclusão" maxWidth="max-w-sm">
      <div className="p-5">
        <p className="text-sm text-fg-2 mb-4">
          Tem certeza que deseja excluir a conta <strong className="text-fg">{accountName}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>
            Excluir
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal de QR Code ──────────────────────────────────────────────────────────
function QRModal({
  accountId,
  onClose,
}: {
  accountId: number | null
  onClose: () => void
}) {
  const { data: qrData, refetch: refetchQR } = useQuery({
    queryKey: ['accounts', accountId, 'qr'],
    queryFn: () => apiClient.get(`/api/accounts/wa/${accountId}/qr`).then(r => r.data),
    refetchInterval: (data: any) => {
      if (!data) return 3000
      if (data?.state === 'qr') return 22000     // QR expira em ~25s
      if (data?.state === 'creating') return 2500 // aguardar criação
      return 4000                                 // waiting / error
    },
    enabled: !!accountId,
  })

  const { data: statusData } = useQuery<StatusData>({
    queryKey: ['accounts', accountId, 'status'],
    queryFn: () => apiClient.get(`/api/accounts/wa/${accountId}/status`).then(r => r.data),
    refetchInterval: 3000,
    enabled: !!accountId,
  })

  const connected = statusData?.status === 'WORKING' || statusData?.status === 'connected'

  useEffect(() => {
    if (connected) {
      const t = setTimeout(onClose, 1500)
      return () => clearTimeout(t)
    }
  }, [connected, onClose])

  return (
    <Modal open={!!accountId} onClose={onClose} title="Conectar via QR Code" maxWidth="max-w-sm">
      <div className="p-5 flex flex-col items-center gap-4">
        {connected ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <span className="text-4xl">✓</span>
            <p className="text-sm font-medium text-success">Conta conectada!</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-fg-3 text-center">
              Escaneie o QR Code com o WhatsApp para conectar a conta.
              Atualizando automaticamente…
            </p>

            <div className="w-72 h-72 rounded-md border border-border bg-surface flex items-center justify-center overflow-hidden">
              {qrData?.state === 'qr' && qrData.base64 ? (
                <img src={qrData.base64} alt="QR Code WhatsApp" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center px-4">
                  <p className="text-sm text-fg-2">
                    {qrData?.state === 'creating' ? '⏳ Criando instância...' :
                     qrData?.state === 'error'    ? '❌ Erro na Evolution API' :
                     qrData?.state === 'not_configured' ? '⚙️ Evolution não configurada' :
                     '⏳ Aguardando QR code...'}
                  </p>
                  {qrData?.message && (
                    <p className="text-xs text-fg-3 break-all">{qrData.message}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => refetchQR()}
                    className="text-xs text-accent hover:underline mt-1"
                  >
                    atualizar agora
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-fg-3">
              Status atual:{' '}
              <Badge variant={statusVariant[statusData?.status ?? ''] ?? 'default'} size="sm">
                {statusData?.status ?? 'aguardando…'}
              </Badge>
            </p>
          </>
        )}
        <Button variant="secondary" size="sm" onClick={onClose} className="w-full">
          Fechar
        </Button>
      </div>
    </Modal>
  )
}

// ── Modal de criação de conta ─────────────────────────────────────────────────
interface CreateForm {
  name: string
  provider: string
  base_url: string
  api_key: string
  instance: string
  role: string
  daily_limit: number
  bot_token: string
  bot_username: string
}

const emptyForm: CreateForm = {
  name: '',
  provider: 'evolution',
  base_url: '',
  api_key: '',
  instance: '',
  role: 'sender',
  daily_limit: 200,
  bot_token: '',
  bot_username: '',
}

function CreateAccountModal({
  open,
  onClose,
  onWACreated,
}: {
  open: boolean
  onClose: () => void
  onWACreated: (id: number) => void
}) {
  const [tab, setTab] = useState<'wa' | 'tg'>('wa')
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof CreateForm, string>>>({})
  const qc = useQueryClient()

  const set = (field: keyof CreateForm, value: string | number) =>
    setForm(f => ({ ...f, [field]: value }))

  const validate = (): boolean => {
    const errs: Partial<Record<keyof CreateForm, string>> = {}
    if (!form.name.trim()) errs.name = 'Campo obrigatório'
    if (tab === 'tg') {
      if (!form.bot_token.trim()) errs.bot_token = 'Campo obrigatório'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const createMut = useMutation({
    mutationFn: () => {
      if (tab === 'wa') {
        return apiClient.post('/api/accounts/wa', {
          name: form.name,
          provider: form.provider,
          base_url: form.base_url,
          api_key: form.api_key,
          instance: form.instance,
          role: form.role,
          daily_limit: Number(form.daily_limit),
        }).then(r => r.data)
      } else {
        return apiClient.post('/api/accounts/tg', {
          name: form.name,
          bot_token: form.bot_token,
          bot_username: form.bot_username,
          role: form.role,
          daily_limit: Number(form.daily_limit),
        }).then(r => r.data)
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setForm(emptyForm)
      setErrors({})
      if (tab === 'wa') {
        apiClient.post(`/api/accounts/wa/${data.id}/session/start`).catch(() => {})
        onWACreated(data.id)
      } else {
        onClose()
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    createMut.mutate()
  }

  const handleClose = () => {
    setForm(emptyForm)
    setErrors({})
    createMut.reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Adicionar conta" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit}>
        <div className="px-5 pt-4">
          <Tabs
            tabs={[
              { id: 'wa', label: 'WhatsApp' },
              { id: 'tg', label: 'Telegram' },
            ]}
            active={tab}
            onChange={id => { setTab(id as 'wa' | 'tg'); setErrors({}) }}
            className="mb-4"
          />
        </div>

        <div className="px-5 pb-4 flex flex-col gap-3">
          <Input
            label="Nome da conta"
            placeholder="Ex: Vendas principal"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            error={errors.name}
          />

          {tab === 'wa' ? (
            <>
              <p className="text-xs text-fg-3 bg-surface-2 rounded-md px-3 py-2">
                A conexão com o WhatsApp usa a Evolution API configurada no servidor. Preencha apenas o nome e clique em "Criar conta" — o QR Code aparecerá a seguir.
              </p>
            </>
          ) : (
            <>
              <Input
                label="Bot Token"
                placeholder="123456:ABC-DEF..."
                type="password"
                value={form.bot_token}
                onChange={e => set('bot_token', e.target.value)}
                error={errors.bot_token}
              />
              <Input
                label="Bot Username (opcional)"
                placeholder="@meu_bot"
                value={form.bot_username}
                onChange={e => set('bot_username', e.target.value)}
              />
            </>
          )}

          {/* Campos comuns */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-fg-2 block mb-1">Papel</label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="sender">Sender</option>
                <option value="reader">Reader</option>
              </select>
            </div>
            <div className="w-32">
              <Input
                label="Limite diário"
                type="number"
                min={0}
                value={form.daily_limit}
                onChange={e => set('daily_limit', Number(e.target.value))}
              />
            </div>
          </div>

          {createMut.isError && (
            <p className="text-xs text-danger">
              Erro ao criar conta. Verifique os dados e tente novamente.
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={createMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={createMut.isPending}>
              Criar conta
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ── AccountCard ───────────────────────────────────────────────────────────────
function AccountCard({
  account,
  platform,
  onReconnect,
  onDelete,
}: {
  account: WAAccount | TGAccount
  platform: string
  onReconnect?: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const wa = account as WAAccount
  const isWA = platform === 'WhatsApp'

  // Polling de status em tempo real via Evolution API (apenas WA)
  const { data: liveStatus } = useQuery<{ status: string }>({
    queryKey: ['wa-live-status', account.id],
    queryFn: () => apiClient.get(`/api/accounts/wa/${account.id}/status`).then(r => r.data),
    refetchInterval: 8_000,
    enabled: isWA,
    staleTime: 5_000,
  })

  const evoStatusMap: Record<string, string> = {
    WORKING: 'connected',
    SCAN_QR_CODE: 'scanning',
    STOPPED: 'disconnected',
  }
  const displayStatus = isWA && liveStatus?.status
    ? (evoStatusMap[liveStatus.status] ?? liveStatus.status.toLowerCase())
    : (wa.status ?? 'ativo')

  const throughputPct =
    account.daily_limit > 0 ? account.sent_today / account.daily_limit : 0
  const throughputColor =
    throughputPct > 0.9
      ? 'bg-danger'
      : throughputPct > 0.7
      ? 'bg-warning'
      : 'bg-success'

  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-medium text-fg">{account.name}</p>
          <p className="text-xs text-fg-3">
            {platform} &middot; {account.role}
          </p>
        </div>
        <Badge variant={statusVariant[displayStatus] ?? 'default'} size="sm">
          {displayStatus}
        </Badge>
      </div>

      {account.daily_limit > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-fg-2 mb-1">
            <span>Enviados hoje</span>
            <span>
              {account.sent_today} / {account.daily_limit}
            </span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${throughputColor} transition-all`}
              style={{ width: `${Math.min(100, throughputPct * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {onReconnect && (
          <Button variant="ghost" size="sm" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate('/logs')}>
          Logs
        </Button>
        <Button variant="ghost" size="sm" className="text-danger hover:text-danger ml-auto" onClick={onDelete}>
          Excluir
        </Button>
      </div>
    </div>
  )
}

// ── Painel lateral "Como conectar" ────────────────────────────────────────────
function ConnectHelpPanel({ activePlatformTab }: { activePlatformTab: string }) {
  if (activePlatformTab === 'tg') {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 h-fit">
        <p className="text-sm font-semibold text-fg mb-4">Como conectar — Telegram</p>
        <ol className="space-y-4 text-sm text-fg-2">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">1</span>
            <div>
              <p className="font-medium text-fg">Crie um Bot</p>
              <p className="text-xs text-fg-3 mt-0.5">Acesse <strong>@BotFather</strong> no Telegram e envie <code className="bg-surface-2 px-1 rounded">/newbot</code>.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">2</span>
            <div>
              <p className="font-medium text-fg">Copie o Token</p>
              <p className="text-xs text-fg-3 mt-0.5">O BotFather fornece um token no formato <code className="bg-surface-2 px-1 rounded">123456:ABC-DEF...</code></p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">3</span>
            <div>
              <p className="font-medium text-fg">Adicione aqui</p>
              <p className="text-xs text-fg-3 mt-0.5">Cole o token no formulário e salve. O bot estará pronto para enviar disparos.</p>
            </div>
          </li>
          {/* Placeholder imagem */}
          <li className="mt-2">
            <div className="w-full h-28 bg-surface-2 border border-dashed border-border rounded-md flex items-center justify-center text-xs text-fg-3">
              [imagem: BotFather screenshot]
            </div>
          </li>
        </ol>
      </div>
    )
  }

  // WhatsApp (default)
  return (
    <div className="bg-surface border border-border rounded-lg p-5 h-fit">
      <p className="text-sm font-semibold text-fg mb-4">Como conectar — WhatsApp</p>
      <ol className="space-y-4 text-sm text-fg-2">
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">1</span>
          <div>
            <p className="font-medium text-fg">Adicione a conta</p>
            <p className="text-xs text-fg-3 mt-0.5">Clique em "+ Adicionar conta", escolha WhatsApp e informe um nome.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">2</span>
          <div>
            <p className="font-medium text-fg">Escaneie o QR Code</p>
            <p className="text-xs text-fg-3 mt-0.5">No WhatsApp: <em>Dispositivos Conectados → Conectar Dispositivo</em> e aponte para o QR.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">3</span>
          <div>
            <p className="font-medium text-fg">Pronto!</p>
            <p className="text-xs text-fg-3 mt-0.5">O status mudará para <Badge variant="success" size="sm">connected</Badge> automaticamente.</p>
          </div>
        </li>
        {/* Placeholder imagem QR */}
        <li className="mt-2">
          <div className="w-full h-28 bg-surface-2 border border-dashed border-border rounded-md flex items-center justify-center text-xs text-fg-3">
            [imagem: QR Code exemplo]
          </div>
        </li>
      </ol>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Accounts() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [qrAccountId, setQrAccountId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    name: string
    platform: 'wa' | 'tg'
  } | null>(null)
  const [platformTab, setPlatformTab] = useState('all')

  const { data: waAccounts = [], isLoading: waLoading } = useQuery<WAAccount[]>({
    queryKey: ['accounts', 'wa'],
    queryFn: () =>
      apiClient.get('/api/accounts/wa').then(r => (Array.isArray(r.data) ? r.data : [])),
  })

  const { data: tgAccounts = [], isLoading: tgLoading } = useQuery<TGAccount[]>({
    queryKey: ['accounts', 'tg'],
    queryFn: () =>
      apiClient.get('/api/accounts/tg').then(r => (Array.isArray(r.data) ? r.data : [])),
  })

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!deleteTarget) return Promise.reject()
      const path =
        deleteTarget.platform === 'wa'
          ? `/api/accounts/wa/${deleteTarget.id}`
          : `/api/accounts/tg/${deleteTarget.id}`
      return apiClient.delete(path)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setDeleteTarget(null)
    },
  })

  useWSEvent('account.status_changed', () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
  })

  const loading = waLoading || tgLoading

  const handleWACreated = (id: number) => {
    setShowCreate(false)
    setQrAccountId(id)
  }

  const handleReconnect = (id: number) => {
    apiClient.post(`/api/accounts/wa/${id}/session/start`).catch(() => {})
    setQrAccountId(id)
  }

  // Tabs with counts
  const platformTabs = [
    { id: 'all', label: `Todas (${waAccounts.length + tgAccounts.length})` },
    { id: 'wa', label: `WhatsApp (${waAccounts.length})` },
    { id: 'tg', label: `Telegram (${tgAccounts.length})` },
  ]

  const visibleWA = platformTab === 'tg' ? [] : waAccounts
  const visibleTG = platformTab === 'wa' ? [] : tgAccounts
  const hasAny = waAccounts.length > 0 || tgAccounts.length > 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Contas conectadas</h1>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + Adicionar conta
        </Button>
      </div>

      {/* Tabs de plataforma */}
      <Tabs
        tabs={platformTabs}
        active={platformTab}
        onChange={setPlatformTab}
        className="mb-5"
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-32" />
          ))}
        </div>
      ) : !hasAny ? (
        <EmptyState
          title="Nenhuma conta"
          description="Conecte uma conta WhatsApp ou Telegram para enviar promacoes."
          cta={{ label: 'Adicionar conta', onClick: () => setShowCreate(true) }}
        />
      ) : (
        /* 2-col layout: lista + painel lateral */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cards — 2/3 da largura */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleWA.map(a => (
                <AccountCard
                  key={`wa-${a.id}`}
                  account={a}
                  platform="WhatsApp"
                  onReconnect={() => handleReconnect(a.id)}
                  onDelete={() => setDeleteTarget({ id: a.id, name: a.name, platform: 'wa' })}
                />
              ))}
              {visibleTG.map(a => (
                <AccountCard
                  key={`tg-${a.id}`}
                  account={a}
                  platform="Telegram"
                  onDelete={() => setDeleteTarget({ id: a.id, name: a.name, platform: 'tg' })}
                />
              ))}
            </div>
          </div>

          {/* Painel lateral "Como conectar" — 1/3 */}
          <div className="lg:col-span-1">
            <ConnectHelpPanel activePlatformTab={platformTab === 'all' ? 'wa' : platformTab} />
          </div>
        </div>
      )}

      <CreateAccountModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onWACreated={handleWACreated}
      />

      <QRModal
        accountId={qrAccountId}
        onClose={() => setQrAccountId(null)}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); deleteMut.reset() }}
        onConfirm={() => deleteMut.mutate()}
        accountName={deleteTarget?.name ?? ''}
        loading={deleteMut.isPending}
      />
    </div>
  )
}
