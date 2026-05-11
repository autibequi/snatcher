import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Tabs } from '../components/ui'
import { pageContainer } from '../lib/uiTokens'
import { SystemTab } from './settings/SystemTab'
import { IntegrationsTab } from './settings/IntegrationsTab'
import { TeamTab } from './settings/TeamTab'
import { AppearanceTab } from './settings/AppearanceTab'

const TABS = [
  { id: 'system', label: 'Sistema' },
  { id: 'integrations', label: 'Integracoes' },
  { id: 'team', label: 'Equipe' },
  { id: 'appearance', label: 'Aparencia' },
]

const VALID_TABS = new Set(TABS.map(t => t.id))

function activeTabFromPath(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)
  const last = seg[seg.length - 1]
  return VALID_TABS.has(last) ? last : 'system'
}

export default function Settings() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = activeTabFromPath(pathname)

  // Redirect bare /settings to /settings/system
  if (!VALID_TABS.has(pathname.split('/').filter(Boolean).pop() ?? '')) {
    return <Navigate to="/settings/system" replace />
  }

  return (
    <div className={pageContainer}>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <Tabs
          tabs={TABS}
          active={active}
          onChange={id => navigate(`/settings/${id}`)}
        />
        <div className="px-4 py-4 sm:p-6">
          {active === 'system' && <SystemTab />}
          {active === 'integrations' && <IntegrationsTab />}
          {active === 'team' && <TeamTab />}
          {active === 'appearance' && <AppearanceTab />}
        </div>
      </div>
    </div>
  )
}
