import { useEffect, useState } from 'react'

interface ModemStatus {
  id?: number
  slug: string
  status: string
  paused_until?: string
  paused_reason?: string
  queue_pending: number
  bans_last_24h: number
}

interface AccountRow {
  id: number
  phone: string
  modem_id: number
  modem_slug: string
  status: string
  daily_send_quota: number
  last_sent_at?: string
  consecutive_failures: number
  sent_today: number
}

function statusBadge(status: string) {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-semibold'
  if (status === 'active') return <span className={`${base} bg-green-100 text-green-700`}>active</span>
  if (status === 'paused') return <span className={`${base} bg-yellow-100 text-yellow-700`}>paused</span>
  if (status === 'quarantine') return <span className={`${base} bg-red-100 text-red-700`}>quarantine</span>
  return <span className={`${base} bg-gray-100 text-gray-600`}>{status}</span>
}

function accountStatusBadge(status: string) {
  const base = 'inline-block px-1.5 py-0.5 rounded text-xs font-medium'
  if (status === 'active') return <span className={`${base} bg-green-50 text-green-700`}>active</span>
  if (status === 'banned') return <span className={`${base} bg-red-50 text-red-700`}>banned</span>
  if (status === 'paused') return <span className={`${base} bg-yellow-50 text-yellow-700`}>paused</span>
  return <span className={`${base} bg-gray-50 text-gray-600`}>{status}</span>
}

export default function AdminSenders() {
  const [modems, setModems] = useState<ModemStatus[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedModem, setExpandedModem] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [statusRes, accountsRes] = await Promise.all([
        fetch('/api/admin/senders/status'),
        fetch('/api/admin/senders/accounts'),
      ])
      const statusData: ModemStatus[] = await statusRes.json()
      const accountsData: AccountRow[] = await accountsRes.json()
      setModems(statusData || [])
      setAccounts(accountsData || [])
    } catch (e) {
      console.error('Failed to load senders data', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handlePause = async (modemSlug: string, modemId: number | undefined, hours: number) => {
    if (!window.confirm(`Pausar modem ${modemSlug} por ${hours}h?`)) return
    if (modemId == null) {
      alert('ID do modem não disponível')
      return
    }
    const key = `${modemSlug}-pause`
    setActionBusy(key)
    try {
      await fetch(`/api/admin/modems/${modemId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, reason: 'manual' }),
      })
      await load()
    } finally {
      setActionBusy(null)
    }
  }

  const handleResume = async (modemSlug: string, modemId: number | undefined) => {
    if (!window.confirm(`Resumir modem ${modemSlug}?`)) return
    if (modemId == null) {
      alert('ID do modem não disponível')
      return
    }
    const key = `${modemSlug}-resume`
    setActionBusy(key)
    try {
      await fetch(`/api/admin/modems/${modemId}/resume`, { method: 'POST' })
      await load()
    } finally {
      setActionBusy(null)
    }
  }

  const accountsForModem = (modemSlug: string) =>
    accounts.filter(a => a.modem_slug === modemSlug)

  const lastSentForModem = (modemSlug: string): string => {
    const modemAccounts = accountsForModem(modemSlug)
    const dates = modemAccounts
      .map(a => a.last_sent_at)
      .filter(Boolean) as string[]
    if (dates.length === 0) return '—'
    const latest = dates.sort().reverse()[0]
    return latest
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Modems & Senders</h1>
        <p className="text-sm text-gray-500 mt-1">
          3 modems 4G com afinidade fixa às contas WhatsApp
        </p>
      </div>

      {/* Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        Para que os senders novos rodem, ligue a flag{' '}
        <code className="font-mono font-semibold">use_send_queue</code> em{' '}
        <a href="/admin/params" className="underline hover:text-blue-900">
          /admin/params
        </a>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Carregando...
        </div>
      )}

      {/* Modem cards */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modems.map(modem => {
            const busy1h = actionBusy === `${modem.slug}-pause`
            const busyResume = actionBusy === `${modem.slug}-resume`
            const anyBusy = busy1h || busyResume
            const modemAccounts = accountsForModem(modem.slug)
            const isExpanded = expandedModem === modem.slug

            return (
              <div key={modem.slug} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col gap-3">
                {/* Title row */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">{modem.slug}</span>
                  {statusBadge(modem.status)}
                </div>

                {/* Metrics */}
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Queue pending</span>
                    <span className="font-medium">{modem.queue_pending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bans 24h</span>
                    <span className={modem.bans_last_24h > 0 ? 'font-semibold text-red-600' : 'font-medium'}>
                      {modem.bans_last_24h}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Ultimo envio</span>
                    <span className="font-medium text-xs">{lastSentForModem(modem.slug)}</span>
                  </div>
                  {modem.paused_until && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Pausado ate</span>
                      <span className="font-medium text-xs text-yellow-700">{modem.paused_until}</span>
                    </div>
                  )}
                  {modem.paused_reason && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Motivo</span>
                      <span className="font-medium text-xs">{modem.paused_reason}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-1">
                  <button
                    onClick={() => handlePause(modem.slug, modem.id, 1)}
                    disabled={anyBusy}
                    className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 disabled:opacity-50"
                  >
                    Pausar 1h
                  </button>
                  <button
                    onClick={() => handlePause(modem.slug, modem.id, 6)}
                    disabled={anyBusy}
                    className="px-3 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded hover:bg-orange-200 disabled:opacity-50"
                  >
                    Pausar 6h
                  </button>
                  {modem.status === 'paused' && (
                    <button
                      onClick={() => handleResume(modem.slug, modem.id)}
                      disabled={anyBusy}
                      className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded hover:bg-green-200 disabled:opacity-50"
                    >
                      Resumir
                    </button>
                  )}
                </div>

                {/* Accounts expand toggle */}
                <button
                  onClick={() => setExpandedModem(isExpanded ? null : modem.slug)}
                  className="text-xs text-blue-600 hover:underline text-left"
                >
                  {isExpanded ? 'Ocultar' : `Ver contas (${modemAccounts.length})`}
                </button>

                {/* Accounts list */}
                {isExpanded && modemAccounts.length > 0 && (
                  <div className="border-t pt-3 space-y-2">
                    {modemAccounts.map(acc => (
                      <div key={acc.id} className="text-xs text-gray-700 flex flex-col gap-0.5 border-b pb-2 last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium">{acc.phone}</span>
                          {accountStatusBadge(acc.status)}
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Enviados hoje</span>
                          <span className="font-medium text-gray-700">
                            {acc.sent_today}/{acc.daily_send_quota}
                          </span>
                        </div>
                        {acc.consecutive_failures > 0 && (
                          <div className="flex justify-between text-gray-400">
                            <span>Falhas consecutivas</span>
                            <span className="font-semibold text-red-600">{acc.consecutive_failures}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isExpanded && modemAccounts.length === 0 && (
                  <p className="text-xs text-gray-400 border-t pt-2">Nenhuma conta vinculada.</p>
                )}
              </div>
            )
          })}

          {modems.length === 0 && (
            <p className="text-gray-500 text-sm col-span-3">Nenhum modem encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}
