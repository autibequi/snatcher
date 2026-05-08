import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'

interface SidebarProps {
  onClose?: () => void
}

interface NavItem {
  to: string
  label: string
  icon: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { to: '/', label: 'Dashboard', icon: '🏠' },
      { to: '/compose', label: 'Compor disparo', icon: '📤' },
      { to: '/logs', label: 'Logs', icon: '📋' },
      { to: '/ads', label: 'Anúncios pagos', icon: '💸' },
    ],
  },
  {
    label: 'Automações',
    items: [
      { to: '/automations', label: 'Visão geral', icon: '⚡' },
      { to: '/automations/channels', label: 'Por canal', icon: '📡' },
      { to: '/automations/jonfrey', label: 'Jonfrey', icon: '🤵' },
    ],
  },
  {
    label: 'Fontes & Produtos',
    items: [
      { to: '/crawlers', label: 'Crawlers', icon: '🔄' },
      { to: '/curation', label: 'Triagem', icon: '✋' },
      { to: '/catalog', label: 'Catálogo', icon: '📦' },
    ],
  },
  {
    label: 'Destinos',
    items: [
      { to: '/channels', label: 'Canais', icon: '📢' },
      { to: '/links', label: 'Links públicos', icon: '🔗' },
    ],
  },
  {
    label: 'Provedores',
    items: [
      { to: '/groups', label: 'Grupos', icon: '👥' },
      { to: '/accounts', label: 'Contas conectadas', icon: '📱' },
      { to: '/affiliates', label: 'Afiliados', icon: '💰' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/analytics', label: 'Insights de cliques', icon: '📊' },
      { to: '/clusters', label: 'Clusters', icon: '🧩' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/taxonomy', label: 'Taxonomia', icon: '🏷️' },
      { to: '/settings', label: 'Configurações', icon: '⚙️' },
    ],
  },
]

export function Sidebar({ onClose }: SidebarProps) {
  const { user } = useAuth()

  const { data: brand } = useQuery({
    queryKey: ['brand'],
    queryFn: () => apiClient.get('/api/brand').then(r => r.data).catch(() => ({})),
    staleTime: 60_000,
  })

  const appName = brand?.app_name || 'Snatcher'
  const appLetter = appName[0]?.toUpperCase() ?? 'S'

  const displayName = user?.name ?? ''
  const displayEmail = user?.email ?? ''
  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Operador'
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="flex flex-col h-full">
      {/* Logo / Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar com inicial do app */}
          <div className="flex-shrink-0 w-8 h-8 rounded-md bg-accent flex items-center justify-center">
            <span className="text-sm font-bold text-white leading-none">{appLetter}</span>
          </div>
          {/* Nome do app */}
          <div className="min-w-0">
            <p className="text-sm font-bold text-fg leading-tight truncate">{appName}</p>
            <p className="text-xs text-fg-3 leading-tight">{brand?.app_domain ?? 'workspace'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-fg-3 hover:text-fg p-1 rounded flex-shrink-0"
          aria-label="Fechar menu"
        >
          ✕
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navGroups.map(group => (
          <div key={group.label} className="mb-4">
            <p className="px-2 py-1 text-xs font-medium text-fg-3 uppercase tracking-wider">
              {group.label}
            </p>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
                  }`
                }
              >
                <span className="w-5 text-center text-base leading-none">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer — user card */}
      <div className="px-3 py-3 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Avatar circular com iniciais */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-accent leading-none">{initials || 'RC'}</span>
          </div>
          {/* Nome + role */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg leading-tight truncate">{displayName}</p>
            <p className="text-xs text-fg-3 leading-tight truncate">
              {roleLabel} · {displayEmail}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
