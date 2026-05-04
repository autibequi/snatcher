import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
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

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  connected: 'success',
  qr_pending: 'warning',
  disconnected: 'default',
  banned: 'danger',
}

function AccountCard({
  account,
  platform,
}: {
  account: WAAccount | TGAccount
  platform: string
}) {
  const wa = account as WAAccount
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
        <Badge variant={statusVariant[wa.status ?? ''] ?? 'default'} size="sm">
          {wa.status ?? 'ativo'}
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
        <Button variant="ghost" size="sm">
          Reconectar
        </Button>
        <Button variant="ghost" size="sm">
          Logs
        </Button>
      </div>
    </div>
  )
}

export default function Accounts() {
  const qc = useQueryClient()

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

  // WS: status changed — invalidate accounts queries
  useWSEvent('account.status_changed', () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
  })

  const loading = waLoading || tgLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Contas conectadas</h1>
        <Button variant="primary" size="sm">+ Adicionar conta</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-32" />
          ))}
        </div>
      ) : waAccounts.length === 0 && tgAccounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta"
          description="Conecte uma conta WhatsApp ou Telegram para enviar promacoes."
          cta={{ label: 'Adicionar conta', onClick: () => {} }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {waAccounts.map(a => (
            <AccountCard key={`wa-${a.id}`} account={a} platform="WhatsApp" />
          ))}
          {tgAccounts.map(a => (
            <AccountCard key={`tg-${a.id}`} account={a} platform="Telegram" />
          ))}
        </div>
      )}
    </div>
  )
}
