import { useRef, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { useAuth } from '../lib/auth'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/match': 'Match',
  '/automations': 'Automações',
  '/automations/channels': 'Automações — Por canal',
  '/automations/jonfrey': 'Jonfrey — Assistente AI',
  '/compose': 'Compor',
  '/logs': 'Logs',
  '/catalog': 'Catálogo',
  '/crawlers': 'Crawlers',
  '/channels': 'Canais',
  '/links': 'Links',
  '/groups': 'Grupos',
  '/accounts': 'Contas',
  '/affiliates': 'Afiliados',
  '/clusters': 'Clusters',
  '/analytics': 'Analytics',
  '/settings': 'Configurações',
  '/taxonomy': 'Taxonomia',
  '/curation': 'Curadoria',
}

function pageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return 'Dashboard'
  const prefix = '/' + parts[0]
  return PAGE_TITLES[prefix] ?? ''
}

interface WAAccount {
  id: number
  status: string
  active: boolean
}

interface TGAccount {
  id: number
  active: boolean
}

interface AccountsStats {
  connected: number
  total: number
}

// TODO: substituir por endpoint dedicado /api/accounts/summary quando disponível
async function fetchAccountsStats(): Promise<AccountsStats> {
  const [waRes, tgRes] = await Promise.all([
    apiClient.get<WAAccount[]>('/api/accounts/wa').then(r => (Array.isArray(r.data) ? r.data : [])),
    apiClient.get<TGAccount[]>('/api/accounts/tg').then(r => (Array.isArray(r.data) ? r.data : [])),
  ])

  const total = waRes.length + tgRes.length
  const connected =
    waRes.filter(a => a.status === 'connected').length +
    tgRes.filter(a => a.active).length

  return { connected, total }
}

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const initials = (user?.name ?? 'U')
    .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('')
  const title = pageTitle(location.pathname)

  return (
    <>
      <header className="flex items-center h-14 px-4 bg-surface border-b border-border flex-shrink-0 gap-3">
        {/* Hamburger mobile */}
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden text-fg-2 hover:text-fg p-1.5 rounded"
          aria-label="Abrir menu"
        >
          ☰
        </button>

        {/* Título da página — desktop */}
        {title && (
          <h1 className="text-sm font-semibold text-fg flex-shrink-0 hidden md:block">{title}</h1>
        )}

        {/* Search bar */}
        <div className="flex-1">
          <SearchBar />
        </div>

        {/* Jobs em background */}
        <JobsBadge />

        {/* Accounts badge */}
        <AccountsBadge />

        {/* Badge de aprovações pendentes */}
        <PendingApprovalsBadge />

        {/* Avatar com inicial do usuário */}
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="w-8 h-8 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center hover:bg-accent/30 transition-colors flex-shrink-0"
          title={user?.name ?? 'Configurações'}
        >
          {initials || 'U'}
        </button>
      </header>

      {/* Título da página — mobile (linha separada abaixo do topbar) */}
      {title && (
        <div className="md:hidden px-4 py-2 bg-surface border-b border-border flex-shrink-0">
          <h1 className="text-base font-semibold text-fg">{title}</h1>
        </div>
      )}
    </>
  )
}

function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: results = [] } = useQuery<any[]>({
    queryKey: ['catalog-search', query],
    queryFn: () => query.trim().length >= 2
      ? apiClient.get(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=8`).then(r => r.data ?? [])
      : Promise.resolve([]),
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const showDropdown = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className="flex-1 max-w-md relative flex items-center">
      <span className="absolute left-2.5 text-fg-2 pointer-events-none text-sm leading-none">🔍</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar produtos, grupos, canais…"
        className="w-full h-8 pl-8 pr-14 rounded-md bg-surface-2 border border-border text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
      />
      <kbd className="absolute right-2 flex items-center gap-0.5 text-[10px] text-fg-3 bg-surface border border-border rounded px-1 py-0.5 pointer-events-none font-mono leading-none">
        ⌘K
      </kbd>

      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-modal z-50 overflow-hidden">
          <p className="px-3 py-1.5 text-xs text-fg-3 border-b border-border">Produtos do catálogo</p>
          {results.map((p: any) => {
            const name = p.canonical_name ?? ''
            const price = p.lowest_price ?? p.lowest_price?.Float64 ?? 0
            const img = typeof p.image_url === 'string' ? p.image_url : p.image_url?.String ?? ''
            return (
              <button
                key={p.id}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-left"
                onClick={() => {
                  navigate(`/compose?productIds=${p.id}`)
                  setQuery('')
                  setOpen(false)
                }}
              >
                {img ? (
                  <img src={img} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="w-8 h-8 rounded bg-surface-2 flex items-center justify-center flex-shrink-0 text-sm">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{name}</p>
                  {price > 0 && <p className="text-xs text-success">R$ {Number(price).toFixed(2)}</p>}
                </div>
                <span className="text-xs text-accent flex-shrink-0">compor →</span>
              </button>
            )
          })}
          <button
            type="button"
            className="w-full px-3 py-2 text-xs text-fg-3 hover:bg-surface-2 border-t border-border text-center"
            onClick={() => { navigate(`/catalog?q=${encodeURIComponent(query)}`); setOpen(false) }}
          >
            Ver todos os resultados no catálogo →
          </button>
        </div>
      )}
    </div>
  )
}

function PendingApprovalsBadge() {
  const navigate = useNavigate()
  const { data: pending = [] } = useQuery<unknown[]>({
    queryKey: ['dispatches', 'pending-approval'],
    queryFn: () => apiClient.get('/api/dispatches/pending-approval').then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 30_000,
    retry: false,
  })
  if (pending.length === 0) return null
  return (
    <button
      type="button"
      onClick={() => navigate('/auto-match')}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
      title={`${pending.length} dispatch${pending.length !== 1 ? 'es' : ''} aguardando aprovação`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
      {pending.length} pendente{pending.length !== 1 ? 's' : ''}
    </button>
  )
}

function AccountsBadge() {
  const { data } = useQuery({
    queryKey: ['accounts-stats'],
    queryFn: fetchAccountsStats,
    staleTime: 8_000,
    refetchInterval: 10_000,
    retry: false,
  })

  const connected = data?.connected ?? 0
  const total = data?.total ?? 0

  let colorClass: string
  if (connected === 0) {
    colorClass = 'bg-danger/10 text-danger'
  } else if (connected < total) {
    colorClass = 'bg-warning/10 text-warning'
  } else {
    colorClass = 'bg-success/10 text-success'
  }

  const dotColor =
    connected === 0 ? 'bg-danger' : connected < total ? 'bg-warning' : 'bg-success'

  return (
    <button
      type="button"
      onClick={() => (window.location.href = '/accounts')}
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${colorClass} hover:opacity-80 transition-opacity`}
      title={`${connected} de ${total} contas conectadas`}
    >
      <span className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0`} />
      <span>{connected}/{total} contas</span>
    </button>
  )
}

interface JobRow {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  started_at: string
  completed_at?: string
  progress: number
  total?: number
  done?: number
  message?: string
  error?: string
}

function JobsBadge() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: jobs = [], refetch } = useQuery<JobRow[]>({
    queryKey: ['jobs'],
    queryFn: () => apiClient.get('/api/jobs').then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 3_000,
    retry: false,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const running = jobs.filter(j => j.status === 'running')
  const finished = jobs.filter(j => j.status !== 'running')

  if (jobs.length === 0) return null

  const cancelOne = (id: string) => {
    apiClient.post(`/api/jobs/${id}/cancel`).then(() => refetch())
  }
  const cancelAll = () => {
    if (confirm('Cancelar TODOS os jobs em execução?')) {
      apiClient.post('/api/jobs/cancel-all').then(() => refetch())
    }
  }
  const clearAll = () => {
    apiClient.post('/api/jobs/clear').then(() => refetch())
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          running.length > 0
            ? 'bg-accent/10 text-accent hover:bg-accent/20'
            : 'bg-surface-2 text-fg-3 hover:text-fg'
        }`}
        title={`${running.length} jobs rodando`}
      >
        {running.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        )}
        ⚙ {running.length > 0 ? `${running.length} job${running.length !== 1 ? 's' : ''}` : 'jobs'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-96 bg-surface border border-border rounded-lg shadow-modal z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Jobs em background</p>
            <div className="flex items-center gap-2">
              {running.length > 0 && (
                <button onClick={cancelAll} className="text-xs text-danger hover:underline">cancelar todos</button>
              )}
              {finished.length > 0 && (
                <button onClick={clearAll} className="text-xs text-fg-3 hover:text-fg">limpar finalizados</button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {jobs.map(j => (
              <div key={j.id} className="px-3 py-2 border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg font-medium truncate">{j.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    j.status === 'running' ? 'bg-accent/10 text-accent' :
                    j.status === 'completed' ? 'bg-success/10 text-success' :
                    j.status === 'failed' ? 'bg-danger/10 text-danger' :
                    'bg-fg-3/10 text-fg-3'
                  }`}>{j.status}</span>
                </div>
                {j.status === 'running' && (
                  <>
                    <div className="mt-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all" style={{ width: `${j.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-fg-3">{j.done ?? 0}/{j.total ?? '?'} · {j.progress}%</span>
                      <button onClick={() => cancelOne(j.id)} className="text-xs text-danger hover:underline">cancelar</button>
                    </div>
                  </>
                )}
                {j.message && (
                  <p className="text-xs text-fg-3 mt-0.5 truncate" title={j.message}>{j.message}</p>
                )}
                {j.error && (
                  <p className="text-xs text-danger mt-0.5 break-all">{j.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
