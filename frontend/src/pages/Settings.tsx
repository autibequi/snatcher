import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Tabs } from '../components/ui'
import { PageHeader } from '../components/ui/PageHeader'
import { pageContainer } from '../lib/uiTokens'
import { SystemTab } from './settings/SystemTab'
import { IntegrationsTab } from './settings/IntegrationsTab'
import { LLMTab } from './settings/LLMTab'
import { JonfreyTab } from './settings/JonfreyTab'
import { TeamTab } from './settings/TeamTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { DangerTab } from './settings/DangerTab'
import { LoopsTab } from './settings/LoopsTab'
import { ParamsTab } from './settings/ParamsTab'
import { AlertsTab } from './settings/AlertsTab'

const TABS = [
  { id: 'system',       label: 'Sistema' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'loops',        label: 'Automação' },
  { id: 'params',       label: 'Parâmetros' },
  { id: 'alerts',       label: 'Alertas' },
  { id: 'llm',          label: 'LLM' },
  { id: 'jonfrey',      label: 'Jonfrey' },
  { id: 'team',         label: 'Equipe' },
  { id: 'appearance',   label: 'Aparência' },
  { id: 'danger',       label: 'Danger' },
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

  if (!VALID_TABS.has(pathname.split('/').filter(Boolean).pop() ?? '')) {
    return <Navigate to="/settings/system" replace />
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Configurações" className="mb-4" />
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <Tabs
          tabs={TABS}
          active={active}
          onChange={id => navigate(`/settings/${id}`)}
        />
        <div className="px-4 py-4 sm:p-6">
          {active === 'system'       && <SystemTab />}
          {active === 'integrations' && <IntegrationsTab />}
          {active === 'loops'        && <LoopsTab />}
          {active === 'params'       && <ParamsTab />}
          {active === 'alerts'       && <AlertsTab />}
          {active === 'llm'          && <LLMTab />}
          {active === 'jonfrey'      && <JonfreyTab />}
          {active === 'team'         && <TeamTab />}
          {active === 'appearance'   && <AppearanceTab />}
          {active === 'danger'       && <DangerTab />}
        </div>
      </div>
    </div>
  )
}
