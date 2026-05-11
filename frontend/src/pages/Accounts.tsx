import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Input,
  Skeleton,
  EmptyState,
  Tabs,
  Modal,
  PageHeader,
  PlatformPill,
} from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'
import {
  sectionCard,
  sectionHeader,
  sectionTitle,
  sectionSubtitle,
  pageContainer,
  responsiveGrid,
  formLabel,
  formGroup,
} from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  state?: string
  base64?: string
  message?: string
}

interface StatusData {
  status: string
}

interface AccountsAntiBanConfig {
  interval_between_groups?: number
  interval_between_channels?: number
  daily_limit_per_account?: number
  rotate_accounts?: boolean
  [key: string]: unknown
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  connected: 'success',
  qr_pending: 'warning',
  scanning: 'warning',
  disconnected: 'default',
  stopped: 'default',
  banned: 'danger',
}

const evoStatusMap: Record<string, string> = {
  WORKING: 'connected',
  SCAN_QR_CODE: 'scanning',
  STOPPED: 'disconnected',
}

// ── Anti-ban panel ─────────────────────────────────────────────────────────────

function AccountsAntiBanPanel() {
  const qc = useQueryClient()
  const [localConfig, setLocalConfig] = useState<Partial<AccountsAntiBanConfig>>({})

  const { data: config, isLoading } = useQuery<AccountsAntiBanConfig>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
  })

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.put('/api/config', { ...config, ...localConfig }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setLocalConfig({})
    },
  })

  const merged: AccountsAntiBanConfig = { ...config, ...localConfig }
  const updateField = (key: keyof AccountsAntiBanConfig, value: unknown) =>
    setLocalConfig(prev => ({ ...prev, [key]: value }))

  return (
    <div className={`${sectionCard} mb-6 max-w-4xl`}>
      <div className={sectionHeader}>
        <div>
          <p className={sectionTitle}>Anti-ban</p>
          <p className={sectionSubtitle}>
            Limites globais para WhatsApp/Telegram — ritmo entre grupos/canais, teto diario por conta e rotacao.
          </p>
        </div>
      </div>

      {isLoading && !config ? (
        <Skeleton variant="card" className="h-24" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className={formGroup}>
            <label className={formLabel}>Intervalo entre grupos (s)</label>
            <input
              type="number"
              min={0}
              value={(merged.interval_between_groups as number) ?? 5}
              onChange={e =>
                updateField('interval_between_groups', Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Intervalo entre canais (s)</label>
            <input
              type="number"
              min={0}
              value={(merged.interval_between_channels as number) ?? 30}
              onChange={e =>
                updateField('interval_between_channels', Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Limite diario por conta</label>
            <input
              type="number"
              min={0}
              value={(merged.daily_limit_per_account as number) ?? 200}
              onChange={e =>
                updateField('daily_limit_per_account', Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(merged.rotate_accounts as boolean) ?? false}
                onChange={e => updateField('rotate_accounts', e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-fg">Rotacionar contas</span>
            </label>
            <p className="text-xs text-fg-3 mt-1">Alterna entre contas disponíveis em cada disparo.</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          loading={saveMut.isPending}
          disabled={isLoading && !config}
          onClick={() => saveMut.mutate()}
        >
          Salvar anti-ban
        </Button>
        {saveMut.isSuccess && <span className="text-xs text-green-400">Salvo.</span>}
        {saveMut.isError && <span className="text-xs text-red-400">Erro ao salvar.</span>}
      </div>
    </div>
  )
}

// ── QR Code modal ─────────────────────────────────────────────────────────────

function QRModal({
  accountId,
  onClose,
}: {
  accountId: number | null
  onClose: () => void
}) {
  const { data: qrData, refetch: refetchQR } = useQuery<QRData>({
    queryKey: ['accounts', accountId, 'qr'],
    queryFn: () => apiClient.get(`/api/accounts/wa/${accountId}/qr`).then(r => r.data),
    refetchInterval: (data: any) => {
      if (!data) return 3000
      if (data?.state === 'qr') return 22000
      if (data?.state === 'creating') return 2500
      return 4000
    },
    enabled: !!accountId,
  })

  const { data: statusData } = useQuery<StatusData>({
    queryKey: ['accounts', accountId, 'status'],
    queryFn: () => apiClient.get(`/api/accounts/wa/${accountId}/status`).then(r => r.data),
    refetchInterval: 5000,
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
    <Modal open={!!accountId} onClose={onClose} title="Conectar via QR Code" panelClassName="max-w-sm">
      <div className="flex flex-col items-center gap-4">
        {connected ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <span className="text-4xl text-success">&#10003;</span>
            <p className="text-sm font-medium text-success">Conta conectada!</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-fg-3 text-center">
              Escaneie o QR Code com o WhatsApp para conectar a conta.
              Atualizando automaticamente...
            </p>

            <div className="w-72 h-72 rounded-md border border-border bg-surface flex items-center justify-center overflow-hidden">
              {qrData?.state === 'qr' && qrData.base64 ? (
                <img src={qrData.base64} alt="QR Code WhatsApp" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center px-4">
                  <p className="text-sm text-fg-2">
                    {qrData?.state === 'creating'
                      ? 'Criando instancia...'
                      : qrData?.state === 'error'
                      ? 'Erro na Evolution API'
                      : qrData?.state === 'not_configured'
                      ? 'Evolution nao configurada'
                      : 'Aguardando QR code...'}
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
              Status:{' '}
              <Badge variant={statusVariant[statusData?.status ?? ''] ?? 'default'} size="sm">
                {statusData?.status ?? 'aguardando...'}
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

// ── Confirm delete modal ───────────────────────────────────────────────────────

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
    <Modal open={open} onClose={onClose} title="Confirmar exclusao" panelClassName="max-w-sm">
      <p className="text-sm text-fg-2 mb-4">
        Tem certeza que deseja excluir a conta{' '}
        <strong className="text-fg">{accountName}</strong>?{' '}
        Esta acao nao pode ser desfeita.
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>
          Excluir
        </Button>
      </div>
    </Modal>
  )
}

// ── Create account modal ──────────────────────────────────────────────────────

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
    if (!form.name.trim()) errs.name = 'Campo obrigatorio'
    if (tab === 'tg' && !form.bot_token.trim()) errs.bot_token = 'Campo obrigatorio'
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
      }
      return apiClient.post('/api/accounts/tg', {
        name: form.name,
        bot_token: form.bot_token,
        bot_username: form.bot_username,
        role: form.role,
        daily_limit: Number(form.daily_limit),
      }).then(r => r.data)
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
    <Modal
      open={open}
      onClose={handleClose}
      title="Conectar conta"
      panelClassName="max-w-lg"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={createMut.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="create-account-form" variant="primary" size="sm" loading={createMut.isPending}>
            Criar conta
          </Button>
        </>
      }
    >
      <form id="create-account-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Tabs
          tabs={[
            { id: 'wa', label: 'WhatsApp' },
            { id: 'tg', label: 'Telegram' },
          ]}
          active={tab}
          onChange={id => { setTab(id as 'wa' | 'tg'); setErrors({}) }}
        />

        <Input
          label="Nome da conta"
          placeholder="Ex: Vendas principal"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          error={errors.name}
        />

        {tab === 'wa' ? (
          <p className="text-xs text-fg-3 bg-surface-2 rounded-md px-3 py-2">
            A conexao com o WhatsApp usa a Evolution API configurada no servidor.
            Preencha apenas o nome e clique em Criar conta. O QR Code aparecera a seguir.
          </p>
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
              label="Limite diario"
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
      </form>
    </Modal>
  )
}

// ── Account card ──────────────────────────────────────────────────────────────

function AccountCard({
  account,
  platform,
  onReconnect,
  onTest,
  onDelete,
}: {
  account: WAAccount | TGAccount
  platform: 'wa' | 'tg'
  onReconnect?: () => void
  onTest?: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const wa = account as WAAccount
  const isWA = platform === 'wa'

  const { data: liveStatus } = useQuery<StatusData>({
    queryKey: ['wa-live-status', account.id],
    queryFn: () => apiClient.get(`/api/accounts/wa/${account.id}/status`).then(r => r.data),
    refetchInterval: 15_000,
    enabled: isWA,
    staleTime: 10_000,
  })

  const displayStatus = isWA && liveStatus?.status
    ? (evoStatusMap[liveStatus.status] ?? liveStatus.status.toLowerCase())
    : (wa.status ?? 'ativo')

  const tg = account as TGAccount
  const subline = isWA
    ? (wa.base_url?.Valid ? wa.base_url.String : null)
    : (tg.bot_username?.Valid ? tg.bot_username.String : null)

  const throughputPct =
    account.daily_limit > 0 ? account.sent_today / account.daily_limit : 0
  const throughputColor =
    throughputPct > 0.9 ? 'bg-danger' : throughputPct > 0.7 ? 'bg-warning' : 'bg-success'

  return (
    <div className={`${sectionCard} flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <PlatformPill platform={platform} size="xs" />
            <p className="font-medium text-fg text-sm truncate">{account.name}</p>
          </div>
          {subline && (
            <p className="text-xs text-fg-3 mt-0.5 truncate">{subline}</p>
          )}
        </div>
        <Badge variant={statusVariant[displayStatus] ?? 'default'} size="sm">
          {displayStatus}
        </Badge>
      </div>

      {/* Body */}
      <div className="text-xs text-fg-3 space-y-0.5">
        <p>
          Papel: <span className="text-fg-2 font-medium">{account.role}</span>
        </p>
        {account.daily_limit > 0 && (
          <div>
            <div className="flex justify-between mb-1">
              <span>Enviados hoje</span>
              <span className="text-fg-2 font-medium">
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
      </div>

      {/* Footer — acoes diretas */}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
        {onReconnect && (
          <Button variant="ghost" size="sm" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
        {onTest && (
          <Button variant="ghost" size="sm" onClick={onTest}>
            Testar
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/activity?account=${account.id}`)}
        >
          Logs
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:text-danger ml-auto"
          onClick={onDelete}
        >
          Remover
        </Button>
      </div>
    </div>
  )
}

// ── Pagina principal ──────────────────────────────────────────────────────────

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
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => (Array.isArray(r.data) ? r.data : [])),
  })

  const { data: tgAccounts = [], isLoading: tgLoading } = useQuery<TGAccount[]>({
    queryKey: ['accounts', 'tg'],
    queryFn: () => apiClient.get('/api/accounts/tg').then(r => (Array.isArray(r.data) ? r.data : [])),
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

  const handleTest = (id: number, platform: 'wa' | 'tg') => {
    const path =
      platform === 'wa'
        ? `/api/accounts/wa/${id}/test`
        : `/api/accounts/tg/${id}/test`
    apiClient.post(path).catch(() => {})
  }

  const platformTabs = [
    { id: 'all', label: `Todas (${waAccounts.length + tgAccounts.length})` },
    { id: 'wa', label: `WhatsApp (${waAccounts.length})` },
    { id: 'tg', label: `Telegram (${tgAccounts.length})` },
  ]

  const visibleWA = platformTab === 'tg' ? [] : waAccounts
  const visibleTG = platformTab === 'wa' ? [] : tgAccounts
  const hasAny = waAccounts.length > 0 || tgAccounts.length > 0

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Contas conectadas"
        subtitle="WhatsApp e Telegram prontos para enviar mensagens."
        className="mb-6"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            Conectar conta
          </Button>
        }
      />

      <AccountsAntiBanPanel />

      <Tabs
        tabs={platformTabs}
        active={platformTab}
        onChange={setPlatformTab}
        className="mb-5"
      />

      {loading ? (
        <div className={responsiveGrid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-40" />
          ))}
        </div>
      ) : !hasAny ? (
        <EmptyState
          title="Nenhuma conta"
          description="Conecte uma conta WhatsApp ou Telegram para comecar a enviar mensagens."
          cta={{ label: 'Conectar conta', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className={responsiveGrid}>
          {visibleWA.map(a => (
            <AccountCard
              key={`wa-${a.id}`}
              account={a}
              platform="wa"
              onReconnect={() => handleReconnect(a.id)}
              onTest={() => handleTest(a.id, 'wa')}
              onDelete={() => setDeleteTarget({ id: a.id, name: a.name, platform: 'wa' })}
            />
          ))}
          {visibleTG.map(a => (
            <AccountCard
              key={`tg-${a.id}`}
              account={a}
              platform="tg"
              onTest={() => handleTest(a.id, 'tg')}
              onDelete={() => setDeleteTarget({ id: a.id, name: a.name, platform: 'tg' })}
            />
          ))}
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
