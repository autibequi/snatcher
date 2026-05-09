import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

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
      { to: '/ads', label: 'Anúncios pagos', icon: '💸' },
    ],
  },
  {
    label: 'Automações',
    items: [
      { to: '/automations', label: 'Automações', icon: '⚡' },
      { to: '/automations/channels', label: 'Canais', icon: '📢' },
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
    label: 'Provedores',
    items: [
      { to: '/groups', label: 'Grupos', icon: '👥' },
      { to: '/accounts', label: 'Contas conectadas', icon: '📱' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/analytics', label: 'Insights de cliques', icon: '📊' },
      { to: '/links', label: 'Links públicos', icon: '🔗' },
      { to: '/clusters', label: 'Clusters', icon: '🧩' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/logs', label: 'Logs', icon: '📋' },
      { to: '/affiliates', label: 'Afiliados', icon: '💰' },
      { to: '/taxonomy', label: 'Taxonomia', icon: '🏷️' },
      { to: '/settings', label: 'Configurações', icon: '⚙️' },
      { to: '/manual', label: 'Manual', icon: '📖' },
    ],
  },
]

export function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { user } = useAuth()

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
      {/* Topo compacto: avatar + utilizador (clique → configurações); ✕ só mobile */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            navigate('/settings')
            onClose?.()
          }}
          className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md py-1 px-1 -mx-1 hover:bg-surface-2 transition-colors"
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-accent leading-none">{initials || 'RC'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg leading-tight truncate">{displayName || 'Conta'}</p>
            <p className="text-[10px] text-fg-3 leading-tight truncate">
              {roleLabel}
              {displayEmail ? ` · ${displayEmail}` : ''}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-fg-3 hover:text-fg p-1.5 rounded flex-shrink-0"
          aria-label="Fechar menu"
        >
          ✕
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 min-h-0">
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
    </div>
  )
}
