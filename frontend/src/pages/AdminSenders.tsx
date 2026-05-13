import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'
import { pageContainer } from '../lib/uiTokens'

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

const STATUS_OPTIONS = ['primary', 'backup', 'warming', 'quarantine', 'banned']

function modemLabel(slug: string): string {
  if (slug === 'host') return 'HOST (esta máquina)'
  return slug
}

function statusBadge(status: string) {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-semibold'
  if (status === 'active') return <span className={`${base} bg-success-soft text-success`}>ativo</span>
  if (status === 'paused') return <span className={`${base} bg-warning-soft text-warning`}>pausado</span>
  if (status === 'quarantine') return <span className={`${base} bg-danger-soft text-danger`}>quarentena</span>
  return <span className={`${base} bg-surface-2 text-fg-2`}>{status}</span>
}

function accountStatusBadge(status: string) {
  const base = 'inline-block px-1.5 py-0.5 rounded text-xs font-medium'
  if (status === 'primary') return <span className={`${base} bg-success-soft text-success`}>primária</span>
  if (status === 'backup')  return <span className={`${base} bg-accent-soft text-accent`}>backup</span>
  if (status === 'warming') return <span className={`${base} bg-surface-2 text-fg-3`}>warming</span>
  if (status === 'quarantine') return <span className={`${base} bg-warning-soft text-warning`}>quarentena</span>
  if (status === 'banned')  return <span className={`${base} bg-danger-soft text-danger`}>banida</span>
  return <span className={`${base} bg-surface-2 text-fg-2`}>{status}</span>
}

export default function AdminSenders() {
  const [modems, setModems] = useState<ModemStatus[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedModem, setExpandedModem] = useState<string | null>('host')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [addPhone, setAddPhone] = useState<Record<string, string>>({})
  const [addQuota, setAddQuota] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    try {
      const [statusRes, accountsRes] = await Promise.all([
        authFetch('/api/admin/senders/status'),
        authFetch('/api/admin/senders/accounts'),
      ])
      const statusData: ModemStatus[] = await statusRes.json()
      const accountsData: AccountRow[] = await accountsRes.json()
      // HOST primeiro, depois o resto
      const sorted = [...(statusData || [])].sort((a, b) => {
        if (a.slug === 'host') return -1
        if (b.slug === 'host') return 1
        return a.slug.localeCompare(b.slug)
      })
      setModems(sorted)
      setAccounts(accountsData || [])
    } catch (e) {
      console.error('Failed to load senders data', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handlePause = async (slug: string, modemId: number | undefined, hours: number) => {
    if (!window.confirm(`Pausar modem ${slug} por ${hours}h?`)) return
    if (modemId == null) { alert('ID do modem não disponível'); return }
    setActionBusy(`${slug}-pause`)
    try {
      await authFetch(`/api/admin/modems/${modemId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, reason: 'manual' }),
      })
      await load()
    } finally { setActionBusy(null) }
  }

  const handleResume = async (slug: string, modemId: number | undefined) => {
    if (!window.confirm(`Resumir modem ${slug}?`)) return
    if (modemId == null) { alert('ID do modem não disponível'); return }
    setActionBusy(`${slug}-resume`)
    try {
      await authFetch(`/api/admin/modems/${modemId}/resume`, { method: 'POST' })
      await load()
    } finally { setActionBusy(null) }
  }

  const handleAddAccount = async (modem: ModemStatus) => {
    const phone = (addPhone[modem.slug] ?? '').trim()
    if (!phone) { alert('Informe o número de telefone'); return }
    if (modem.id == null) { alert('ID do modem não disponível'); return }
    const quota = parseInt(addQuota[modem.slug] ?? '20') || 20
    setActionBusy(`${modem.slug}-add`)
    try {
      const r = await authFetch(`/api/admin/modems/${modem.id}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, daily_send_quota: quota }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }))
        alert(`Erro: ${err.error ?? r.statusText}`)
        return
      }
      setAddPhone(p => ({ ...p, [modem.slug]: '' }))
      await load()
    } finally { setActionBusy(null) }
  }

  const handleDeleteAccount = async (acc: AccountRow) => {
    if (!window.confirm(`Remover conta ${acc.phone}?`)) return
    setActionBusy(`acc-${acc.id}`)
    try {
      await authFetch(`/api/admin/accounts/${acc.id}`, { method: 'DELETE' })
      await load()
    } finally { setActionBusy(null) }
  }

  const handleUpdateAccountStatus = async (acc: AccountRow, status: string) => {
    setActionBusy(`acc-${acc.id}`)
    try {
      await authFetch(`/api/admin/accounts/${acc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await load()
    } finally { setActionBusy(null) }
  }

  const accountsForModem = (slug: string) => accounts.filter(a => a.modem_slug === slug)

  return (
    <div className={`${pageContainer} space-y-6`}>
      <div>
        <h1 className="text-2xl font-bold">Modems & Contas</h1>
        <p className="text-sm text-fg-3 mt-1">Gerencie modems e as contas WhatsApp vinculadas a cada um.</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-fg-3 text-sm">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Carregando...
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {modems.map(modem => {
            const modemAccounts = accountsForModem(modem.slug)
            const isExpanded = expandedModem === modem.slug
            const anyBusy = actionBusy?.startsWith(modem.slug)
            const isHost = modem.slug === 'host'

            return (
              <div
                key={modem.slug}
                className={`bg-surface border rounded-lg shadow-sm overflow-hidden ${isHost ? 'border-accent/30' : 'border-border'}`}
              >
                {/* Header do modem */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2/30">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">{modemLabel(modem.slug)}</span>
                    {isHost && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">HOST</span>}
                    {statusBadge(modem.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-fg-3">
                    <span>Fila: <strong>{modem.queue_pending}</strong></span>
                    <span>Bans 24h: <strong className={modem.bans_last_24h > 0 ? 'text-danger' : ''}>{modem.bans_last_24h}</strong></span>
                    {!isHost && (
                      <>
                        <button
                          onClick={() => handlePause(modem.slug, modem.id, 1)}
                          disabled={!!anyBusy}
                          className="px-2 py-0.5 bg-warning-soft text-warning rounded hover:bg-warning-soft/80 disabled:opacity-50"
                        >Pausar 1h</button>
                        <button
                          onClick={() => handlePause(modem.slug, modem.id, 6)}
                          disabled={!!anyBusy}
                          className="px-2 py-0.5 bg-warning-soft text-warning rounded hover:bg-warning-soft/80 disabled:opacity-50"
                        >Pausar 6h</button>
                        {modem.status === 'paused' && (
                          <button
                            onClick={() => handleResume(modem.slug, modem.id)}
                            disabled={!!anyBusy}
                            className="px-2 py-0.5 bg-success-soft text-success rounded hover:bg-success-soft/80 disabled:opacity-50"
                          >Resumir</button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => setExpandedModem(isExpanded ? null : modem.slug)}
                      className="text-accent hover:underline ml-1"
                    >
                      {isExpanded ? 'Fechar' : `Contas (${modemAccounts.length})`}
                    </button>
                  </div>
                </div>

                {/* Contas + form de adição */}
                {isExpanded && (
                  <div className="px-4 py-3 space-y-2">
                    {/* Form adicionar conta */}
                    <div className="flex gap-2 items-center pb-3 border-b border-border">
                      <input
                        type="text"
                        placeholder="+55 11 99999-9999"
                        value={addPhone[modem.slug] ?? ''}
                        onChange={e => setAddPhone(p => ({ ...p, [modem.slug]: e.target.value }))}
                        className="flex-1 text-sm border border-border rounded px-2 py-1.5 bg-bg focus:outline-none focus:border-accent"
                      />
                      <input
                        type="number"
                        placeholder="Quota/dia"
                        value={addQuota[modem.slug] ?? '20'}
                        onChange={e => setAddQuota(p => ({ ...p, [modem.slug]: e.target.value }))}
                        className="w-24 text-sm border border-border rounded px-2 py-1.5 bg-bg focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => handleAddAccount(modem)}
                        disabled={actionBusy === `${modem.slug}-add`}
                        className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 font-medium"
                      >
                        + Adicionar
                      </button>
                    </div>

                    {/* Lista de contas */}
                    {modemAccounts.length === 0 ? (
                      <p className="text-xs text-fg-3 py-2">Nenhuma conta vinculada. Adicione uma acima.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {modemAccounts.map(acc => (
                          <div key={acc.id} className="py-2.5 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium text-fg">{acc.phone}</span>
                                {accountStatusBadge(acc.status)}
                              </div>
                              <div className="text-xs text-fg-3 mt-0.5">
                                {acc.sent_today}/{acc.daily_send_quota} hoje
                                {acc.consecutive_failures > 0 && (
                                  <span className="ml-2 text-danger">{acc.consecutive_failures} falhas</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <select
                                value={acc.status}
                                onChange={e => handleUpdateAccountStatus(acc, e.target.value)}
                                disabled={actionBusy === `acc-${acc.id}`}
                                className="text-xs border border-border rounded px-1.5 py-1 bg-surface text-fg focus:outline-none focus:border-accent"
                              >
                                {STATUS_OPTIONS.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleDeleteAccount(acc)}
                                disabled={actionBusy === `acc-${acc.id}`}
                                className="text-xs text-danger hover:underline disabled:opacity-50"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {modem.paused_until && !isExpanded && (
                  <div className="px-4 py-2 text-xs text-warning border-t border-border">
                    Pausado até {modem.paused_until} · Motivo: {modem.paused_reason}
                  </div>
                )}
              </div>
            )
          })}

          {modems.length === 0 && (
            <p className="text-fg-3 text-sm">Nenhum modem encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}
