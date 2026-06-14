import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  BarChart3,
  Package,
  Tags,
  Layers,
  Send,
  Users,
  LinkIcon,
  Smartphone,
  Globe,
  Network,
  Gauge,
  Activity,
  Eye,
  Settings,
  BookOpen,
  ChevronDown,
  ChevronRight,
  X,
} from '../lib/icons'
import type { LucideIcon } from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  to: string
  Icon: LucideIcon
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

// ─── navigation definition ────────────────────────────────────────────────────

// Each group id is stable across re-renders and used as the localStorage key segment.
const NAV: NavGroup[] = [
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      { to: '/',                  label: 'Dashboard',   Icon: LayoutDashboard },
      { to: '/compose',           label: 'Composer',    Icon: MessageSquare   },
      { to: '/admin/templates',   label: 'Templates',   Icon: FileText        },
      { to: '/admin/metrics',     label: 'Métricas',    Icon: BarChart3       },
    ],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    items: [
      { to: '/admin/catalog-canonical', label: 'Catálogo',   Icon: Package },
      { to: '/taxonomy',                label: 'Taxonomia',  Icon: Tags    },
      // Canônicos — rota criada em FW-4; aponta para rota futura (404 aceitável nesta wave)
      { to: '/admin/canonical-groups',  label: 'Produtos',   Icon: Layers  },
    ],
  },
  {
    id: 'distribuicao',
    label: 'Distribuição',
    items: [
      { to: '/channels',                    label: 'Canais',         Icon: Send        },
      { to: '/groups',                      label: 'Grupos',         Icon: Users       },
      { to: '/affiliates',                  label: 'Afiliados',      Icon: LinkIcon    },
      { to: '/admin/senders',               label: 'Modems',         Icon: Smartphone  },
      { to: '/admin/domains',               label: 'Domínios',       Icon: Globe       },
      // Roteamento e Rate Buckets — rotas criadas em FW-4 (404 aceitável nesta wave)
      { to: '/admin/dispatch/routing',      label: 'Roteamento',     Icon: Network     },
      { to: '/admin/dispatch/rate-buckets', label: 'Rate Buckets',   Icon: Gauge       },
    ],
  },
  {
    id: 'observacao',
    label: 'Observação',
    items: [
      { to: '/admin/observability',       label: 'Pulso',       Icon: Eye          },
      { to: '/activity',                  label: 'Atividade',   Icon: Activity     },
      { to: '/analytics',                 label: 'Analytics',   Icon: BarChart3    },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { to: '/settings', label: 'Configurações', Icon: Settings  },
      { to: '/manual',   label: 'Manual',        Icon: BookOpen  },
    ],
  },
]

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'snatcher.sidebar.expanded'

/** Reads the group expansion map from localStorage. Falls back to all groups expanded. */
function loadExpandedState(): Map<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>
      return new Map(Object.entries(parsed))
    }
  } catch {
    // Ignore parse errors; fall through to default
  }

  // Default: all groups expanded
  const defaults = new Map<string, boolean>()
  for (const group of NAV) {
    defaults.set(group.id, true)
  }
  return defaults
}

/** Persists the current expansion map to localStorage. */
function saveExpandedState(map: Map<string, boolean>): void {
  const obj: Record<string, boolean> = {}
  for (const [key, value] of map) {
    obj[key] = value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
}

// ─── SidebarGroupHeader ───────────────────────────────────────────────────────

interface GroupHeaderProps {
  label: string
  expanded: boolean
  onToggle: () => void
}

/** Renders the collapsable header row for a nav group. */
function SidebarGroupHeader({ label, expanded, onToggle }: GroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-1.5 mt-3 mb-0.5 text-[10px] uppercase tracking-wider text-fg-3 hover:text-fg transition-colors select-none rounded-md hover:bg-surface-2 group"
      aria-expanded={expanded}
    >
      <span>{label}</span>
      {expanded
        ? <ChevronDown size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden />
        : <ChevronRight size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden />
      }
    </button>
  )
}

// ─── SidebarNavItem ───────────────────────────────────────────────────────────

interface NavItemProps {
  item: NavItem
  location: { pathname: string }
}

/** Renders a single nav item with icon and label. */
function SidebarNavItem({ item, location }: NavItemProps) {
  const { to, label, Icon } = item

  // Determine active state: exact match for root, prefix match otherwise
  const isExact = to === '/'
  const isCurrentPage =
    isExact
      ? location.pathname === '/'
      : location.pathname === to || location.pathname.startsWith(`${to}/`)

  return (
    <NavLink
      to={to}
      end={isExact}
      aria-current={isCurrentPage ? 'page' : undefined}
      className={({ isActive }) =>
        [
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-surface-2 text-accent font-medium'
            : 'text-fg-2 hover:text-fg hover:bg-surface-2',
        ].join(' ')
      }
    >
      <Icon
        size={15}
        className="flex-shrink-0 opacity-70"
        aria-hidden
      />
      <span>{label}</span>
    </NavLink>
  )
}

// ─── SidebarProps ─────────────────────────────────────────────────────────────

export interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()

  // Expansion state per group, persisted to localStorage
  const [expanded, setExpanded] = useState<Map<string, boolean>>(loadExpandedState)

  // Toggle a group's collapsed/expanded state and persist immediately
  const toggleGroup = useCallback((groupId: string) => {
    setExpanded(prev => {
      const next = new Map(prev)
      next.set(groupId, !prev.get(groupId))
      saveExpandedState(next)
      return next
    })
  }, [])

  // Auto-close mobile drawer on route change
  useEffect(() => {
    onClose?.()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayName  = user?.name  ?? ''
  const displayEmail = user?.email ?? ''
  const roleLabel    = user?.role === 'admin' ? 'Admin' : 'Operador'

  // Build initials from first two words of the display name
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((word: string) => word[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="flex flex-col h-full">
      {/* User header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Avatar circle with initials */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-accent leading-none">
              {initials || 'RC'}
            </span>
          </div>
          {/* Name + role/email */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg leading-tight truncate">
              {displayName || 'Conta'}
            </p>
            <p className="text-[10px] text-fg-3 leading-tight truncate">
              {roleLabel}{displayEmail ? ` · ${displayEmail}` : ''}
            </p>
          </div>
        </div>

        {/* Close button — visible only on mobile */}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-fg-3 hover:text-fg p-1.5 rounded flex-shrink-0"
          aria-label="Fechar menu"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto py-2 px-2 min-h-0">
        {NAV.map(group => {
          const isExpanded = expanded.get(group.id) !== false

          return (
            <div key={group.id}>
              <SidebarGroupHeader
                label={group.label}
                expanded={isExpanded}
                onToggle={() => toggleGroup(group.id)}
              />

              {isExpanded && (
                <div>
                  {group.items.map(item => (
                    <SidebarNavItem
                      key={item.to}
                      item={item}
                      location={location}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}
