import { NavLink } from 'react-router-dom'

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
      { to: '/', label: 'Dashboard', icon: '◉' },
      { to: '/match', label: 'Match', icon: '⟶' },
      { to: '/compose', label: 'Compor disparo', icon: '✉' },
      { to: '/logs', label: 'Logs', icon: '≡' },
    ],
  },
  {
    label: 'Fontes & Produtos',
    items: [
      { to: '/crawlers', label: 'Crawlers', icon: '↺' },
      { to: '/catalog', label: 'Catálogo', icon: '□' },
    ],
  },
  {
    label: 'Destinos',
    items: [
      { to: '/channels', label: 'Canais', icon: '◈' },
      { to: '/links', label: 'Links públicos', icon: '⊕' },
    ],
  },
  {
    label: 'Provedores',
    items: [
      { to: '/groups', label: 'Grupos', icon: '⊞' },
      { to: '/accounts', label: 'Contas conectadas', icon: '◎' },
      { to: '/affiliates', label: 'Afiliados', icon: '$' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/clusters', label: 'Clusters', icon: '⬡' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/settings', label: 'Configurações', icon: '⚙' },
    ],
  },
]

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border flex-shrink-0">
        <span className="text-sm font-semibold text-fg">Snatcher</span>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-fg-3 hover:text-fg p-1 rounded"
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
                <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-fg-3">v0.1.0-redesign</p>
      </div>
    </div>
  )
}
