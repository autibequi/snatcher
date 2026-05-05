import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../components/ui'
import { apiClient } from '../lib/apiClient'

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
    waRes.filter(a => a.status === 'connected' && a.active).length +
    tgRes.filter(a => a.active).length

  return { connected, total }
}

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate()

  return (
    <header className="flex items-center h-12 px-4 bg-surface border-b border-border flex-shrink-0 gap-3">
      {/* Hamburger mobile */}
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden text-fg-2 hover:text-fg p-1 rounded"
        aria-label="Abrir menu"
      >
        ☰
      </button>

      {/* Search bar — centro */}
      <SearchBar />

      {/* Accounts badge */}
      <AccountsBadge />

      {/* CTA principal */}
      <Button
        variant="primary"
        size="sm"
        onClick={() => navigate('/compose')}
      >
        Disparar
      </Button>

      {/* User menu placeholder */}
      <button
        type="button"
        className="w-7 h-7 rounded-full bg-accent/20 text-accent text-xs font-semibold flex items-center justify-center hover:bg-accent/30"
        aria-label="Menu do usuário"
      >
        U
      </button>
    </header>
  )
}

function SearchBar() {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Capturar Cmd+K / Ctrl+K para focar o input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex-1 max-w-md relative flex items-center">
      {/* Ícone lupa */}
      <span className="absolute left-2.5 text-fg-2 pointer-events-none text-sm leading-none">
        🔍
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar produtos, grupos, canais…"
        className="w-full h-8 pl-8 pr-14 rounded-md bg-surface-2 border border-border text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
      />
      {/* Hint ⌘K */}
      <kbd className="absolute right-2 flex items-center gap-0.5 text-[10px] text-fg-3 bg-surface border border-border rounded px-1 py-0.5 pointer-events-none font-mono leading-none">
        ⌘K
      </kbd>
    </div>
  )
}

function AccountsBadge() {
  const { data } = useQuery({
    queryKey: ['accounts-stats'],
    queryFn: fetchAccountsStats,
    staleTime: 30_000,
    retry: false,
  })

  // Fallback mockado enquanto o backend não responde ou ainda está carregando
  // TODO: remover hardcode quando /api/accounts/wa e /api/accounts/tg retornarem dados reais
  const connected = data?.connected ?? 3
  const total = data?.total ?? 4

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
