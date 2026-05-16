import { NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../lib/auth'

export interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

type NavItem = { label: string; to: string; icon?: string }
type NavGroup = { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { to: '/',               label: 'Dashboard',     icon: '🏠' },
      { to: '/compose',        label: 'Composer', icon: '✍️' },
      { to: '/activity',       label: 'Atividade',      icon: '📋' },
      { to: '/admin/templates', label: 'Templates',      icon: '💬' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/admin/catalog-canonical', label: 'Catálogo',   icon: '📦' },
      { to: '/taxonomy',                label: 'Taxonomia',  icon: '🏷️' },
    ],
  },
  {
    label: 'Scraping',
    items: [
      { to: '/crawlers',       label: 'Crawlers', icon: '🕷️' },
      { to: '/admin/scrapers', label: 'Scrapers', icon: '🕸️' },
    ],
  },
  {
    label: 'Distribuição',
    items: [
      { to: '/channels',        label: 'Canais',         icon: '📺' },
      { to: '/groups',          label: 'Grupos',         icon: '👥' },
      { to: '/affiliates',      label: 'Afiliados',      icon: '💰' },
      { to: '/admin/senders',   label: 'Modems',         icon: '📡' },
      { to: '/admin/domains',   label: 'Domínios',       icon: '🌐' },
    ],
  },
  {
    label: 'Observação',
    items: [
      { to: '/admin/observability', label: 'Observabilidade', icon: '🔭' },
      { to: '/admin/metrics',       label: 'Métricas',        icon: '📈' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/settings',      label: 'Configurações',  icon: '⚙️' },
      { to: '/manual',        label: 'Manual',         icon: '📚' },
    ],
  },
]

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()

  // Auto-close drawer on navigation (mobile)
  useEffect(() => {
    onClose?.()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayName  = user?.name  ?? ''
  const displayEmail = user?.email ?? ''
  const roleLabel    = user?.role === 'admin' ? 'Admin' : 'Operador'
  const initials     = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="flex flex-col h-full">
      {/* User header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-accent leading-none">{initials || 'RC'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg leading-tight truncate">{displayName || 'Conta'}</p>
            <p className="text-[10px] text-fg-3 leading-tight truncate">
              {roleLabel}{displayEmail ? ` · ${displayEmail}` : ''}
            </p>
          </div>
        </div>

        {/* Close button — mobile only */}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-fg-3 hover:text-fg p-1.5 rounded flex-shrink-0"
          aria-label="Fechar menu"
        >
          ✕
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto py-2 px-2 min-h-0">
        {NAV.map(group => (
          <div key={group.label}>
            <p className="text-[10px] uppercase tracking-wider text-fg-3 mt-4 mb-1.5 px-3 select-none">
              {group.label}
            </p>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                aria-current={location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to)) ? 'page' : undefined}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-surface-2 text-accent font-medium'
                      : 'text-fg-2 hover:text-fg hover:bg-surface-2',
                  ].join(' ')
                }
              >
                {item.icon && (
                  <span className="w-4 text-center text-sm leading-none opacity-70" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </div>
  )
}
