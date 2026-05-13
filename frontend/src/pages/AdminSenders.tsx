import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch, authFetchJSON } from '../lib/authFetch'
import { pageContainer } from '../lib/uiTokens'

interface ModemStatus {
  id: number
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

// ── Modal de conexão de conta ─────────────────────────────────────────────────

type Platform = 'whatsapp' | 'telegram'

interface ConnectModalProps {
  modem: ModemStatus
  onClose: () => void
  onConnected: () => void
}

function ConnectModal({ modem, onClose, onConnected }: ConnectModalProps) {
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading_qr' | 'waiting_scan' | 'connected' | 'saving' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [phone, setPhone] = useState('')
  const [quota, setQuota] = useState('20')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const pollStatus = useCallback(async (modemId: number) => {
    try {
      const r = await authFetch(`/api/admin/modems/${modemId}/connection-status`)
      const data: { status: string } = await r.json()
      if (data.status === 'connected') {
        stopPoll()
        setStatus('connected')
      }
    } catch { /* silencia */ }
  }, [stopPoll])

  const loadQR = useCallback(async () => {
    setStatus('loading_qr')
    setQr(null)
    setErrorMsg('')
    try {
      // Checa se já está conectado antes de pedir QR
      const statusR = await authFetch(`/api/admin/modems/${modem.id}/connection-status`)
      const statusData: { status: string } = await statusR.json()
      if (statusData.status === 'connected') {
        setStatus('connected')
        return
      }
      const r = await authFetch(`/api/admin/modems/${modem.id}/qrcode`)
      const body = await r.json().catch(() => null)
      if (!r.ok) {
        setErrorMsg(body?.error ?? `HTTP ${r.status}: ${r.statusText}`)
        setStatus('error')
        return
      }
      const qrValue: string = body?.qr_base64 ?? ''
      if (!qrValue) {
        // QR vazio após EnsureInstance = instância criada mas sem QR disponível ainda
        setErrorMsg('QR code não disponível — tente novamente em alguns segundos.')
        setStatus('error')
        return
      }
      setQr(qrValue)
      setStatus('waiting_scan')
      pollRef.current = setInterval(() => pollStatus(modem.id), 3000)
    } catch (e) {
      setErrorMsg(`Falha de rede: ${String(e)}`)
      setStatus('error')
    }
  }, [modem.id, pollStatus])

  const handleSaveAccount = async () => {
    if (!phone.trim()) { alert('Informe o número'); return }
    setStatus('saving')
    try {
      const r = await authFetch(`/api/admin/modems/${modem.id}/accounts`, {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), daily_send_quota: parseInt(quota) || 20 }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }))
        alert(`Erro ao salvar: ${err.error}`)
        setStatus('connected')
        return
      }
      onConnected()
    } catch {
      alert('Erro ao salvar conta')
      setStatus('connected')
    }
  }

  useEffect(() => () => stopPoll(), [stopPoll])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">Conectar conta</h2>
          <button onClick={onClose} className="text-fg-3 hover:text-fg text-lg leading-none">✕</button>
        </div>

        {/* Seleção de plataforma */}
        {!platform && (
          <div className="space-y-2">
            <p className="text-xs text-fg-3">Escolha a plataforma:</p>
            <button
              onClick={() => { setPlatform('whatsapp'); loadQR() }}
              className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:bg-surface-2 transition-colors text-left"
            >
              <span className="text-2xl">📱</span>
              <div>
                <p className="font-medium text-fg text-sm">WhatsApp</p>
                <p className="text-xs text-fg-3">Conectar via QR code (Evolution API)</p>
              </div>
            </button>
            <button
              disabled
              className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-lg opacity-50 cursor-not-allowed text-left"
            >
              <span className="text-2xl">✈️</span>
              <div>
                <p className="font-medium text-fg text-sm">Telegram</p>
                <p className="text-xs text-fg-3">Em breve</p>
              </div>
            </button>
          </div>
        )}

        {/* QR Code */}
        {platform === 'whatsapp' && (
          <div className="space-y-3 text-center">
            {status === 'loading_qr' && (
              <div className="flex flex-col items-center gap-2 py-6">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-fg-3">Gerando QR code...</p>
              </div>
            )}

            {status === 'waiting_scan' && qr && (
              <>
                <img
                  src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code WhatsApp"
                  className="mx-auto rounded-lg border border-border"
                  style={{ width: 220, height: 220 }}
                />
                <p className="text-xs text-fg-3">Abra o WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                <p className="text-[10px] text-fg-4 animate-pulse">Aguardando leitura...</p>
              </>
            )}

            {(status === 'connected' || status === 'saving') && (
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  <p className="text-sm font-medium text-success">WA conectado! Informe o número:</p>
                </div>
                <input
                  type="text"
                  placeholder="+55 21 99999-9999"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full text-sm border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:border-accent"
                  autoFocus
                />
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={quota}
                    onChange={e => setQuota(e.target.value)}
                    placeholder="Quota/dia"
                    className="w-24 text-sm border border-border rounded px-2 py-2 bg-bg focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-fg-3">envios/dia</span>
                </div>
                <button
                  onClick={handleSaveAccount}
                  disabled={status === 'saving'}
                  className="w-full px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover disabled:opacity-50"
                >
                  {status === 'saving' ? 'Salvando...' : 'Salvar conta'}
                </button>
              </div>
            )}

            {status === 'error' && (
              <div className="rounded-lg bg-danger-soft border border-danger/30 px-3 py-3 space-y-2 text-left">
                <p className="text-xs font-medium text-danger">Erro ao conectar</p>
                <p className="text-xs text-danger break-words">{errorMsg}</p>
                {errorMsg.includes('não configurada') && (
                  <p className="text-[10px] text-fg-3">
                    Configure EVOLUTION_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE nas variáveis de ambiente do backend.
                  </p>
                )}
                <button onClick={loadQR} className="text-xs text-accent hover:underline">
                  Tentar novamente
                </button>
              </div>
            )}

            <button
              onClick={() => { stopPoll(); setPlatform(null); setQr(null); setStatus('idle') }}
              className="text-xs text-fg-3 hover:text-fg underline"
            >
              ← Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSenders() {
  const [modems, setModems] = useState<ModemStatus[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedModem, setExpandedModem] = useState<string | null>('host')
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [connectingModem, setConnectingModem] = useState<ModemStatus | null>(null)

  const { data: evoHealth } = useQuery<{ configured: boolean; api_online: boolean; wa_status: string; instance: string }>({
    queryKey: ['evolution-health'],
    queryFn: () => authFetchJSON('/api/admin/evolution/health', { configured: false, api_online: false, wa_status: 'unknown', instance: '' }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Modems & Contas</h1>
          <p className="text-sm text-fg-3 mt-1">Gerencie modems e as contas WhatsApp vinculadas a cada um.</p>
        </div>
        {evoHealth && (
          <div className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
            !evoHealth.configured
              ? 'bg-surface-2 text-fg-3 border-border'
              : evoHealth.api_online
              ? 'bg-success-soft text-success border-success/30'
              : 'bg-danger-soft text-danger border-danger/30',
          ].join(' ')}>
            <span className={[
              'w-1.5 h-1.5 rounded-full',
              evoHealth.api_online ? 'bg-success animate-pulse' : 'bg-current',
            ].join(' ')} />
            Evolution
            {!evoHealth.configured && ' · não configurada'}
            {evoHealth.configured && evoHealth.api_online && ' · online'}
            {evoHealth.configured && !evoHealth.api_online && ' · inacessível'}
            {evoHealth.api_online && evoHealth.wa_status === 'connected' && (
              <span className="text-[10px] opacity-70 ml-0.5">· WA ✓</span>
            )}
            {evoHealth.instance && evoHealth.configured && (
              <span className="text-[10px] opacity-70 ml-1">{evoHealth.instance}</span>
            )}
          </div>
        )}
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
                      onClick={() => setConnectingModem(modem)}
                      className="text-xs px-2 py-0.5 bg-accent text-white rounded hover:bg-accent-hover ml-1"
                    >
                      + Conectar
                    </button>
                    <button
                      onClick={() => setExpandedModem(isExpanded ? null : modem.slug)}
                      className="text-accent hover:underline ml-1"
                    >
                      {isExpanded ? 'Fechar' : `Contas (${modemAccounts.length})`}
                    </button>
                  </div>
                </div>

                {/* Lista de contas conectadas */}
                {isExpanded && (
                  <div className="px-4 py-3">
                    {modemAccounts.length === 0 ? (
                      <p className="text-xs text-fg-3 py-2">Nenhuma conta vinculada. Use "+ Conectar" para adicionar.</p>
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

      {connectingModem && (
        <ConnectModal
          modem={connectingModem}
          onClose={() => setConnectingModem(null)}
          onConnected={() => { setConnectingModem(null); load() }}
        />
      )}
    </div>
  )
}
