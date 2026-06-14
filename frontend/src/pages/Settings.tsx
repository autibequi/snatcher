import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Tabs } from '../components/ui'
import { PageHeader } from '../components/ui/PageHeader'
import { pageContainer } from '../lib/uiTokens'
import { SystemTab } from './settings/SystemTab'
import { IntegrationsTab } from './settings/IntegrationsTab'
import { LLMTab } from './settings/LLMTab'
import { TeamTab } from './settings/TeamTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { DangerTab } from './settings/DangerTab'
import { ParamsTab } from './settings/ParamsTab'
import { AutomationsTab } from './settings/AutomationsTab'

// 6 abas (antes 9): 'Alertas' removido (era só <SystemHealth/>, já no Painel/Pulso);
// 'LLM' fundido em Integrações; 'Aparência' fundido em Sistema.
const TABS = [
  { id: 'system',       label: 'Sistema' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'automations',  label: 'Automações' },
  { id: 'params',       label: 'Parâmetros' },
  { id: 'team',         label: 'Equipe' },
  { id: 'danger',       label: 'Danger' },
]

const VALID_TABS = new Set(TABS.map(t => t.id))

// Aliases para deep-links antigos das abas que foram fundidas/removidas.
const TAB_ALIASES: Record<string, string> = {
  llm: 'integrations',
  appearance: 'system',
  alerts: 'system', // Alertas vivem no Painel; cai em Sistema.
}

function lastSegment(pathname: string): string {
  return pathname.split('/').filter(Boolean).pop() ?? ''
}

// SectionDivider separa duas sub-seções fundidas dentro de uma mesma aba.
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-3">{label}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const seg = lastSegment(pathname)

  // Link antigo de aba fundida → redireciona pra aba nova.
  if (TAB_ALIASES[seg]) {
    return <Navigate to={`/settings/${TAB_ALIASES[seg]}`} replace />
  }
  if (!VALID_TABS.has(seg)) {
    return <Navigate to="/settings/system" replace />
  }

  const active = seg

  return (
    <div className={pageContainer}>
      <PageHeader title="Configurações" className="mb-4" />
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <Tabs
          tabs={TABS}
          active={active}
          onChange={id => navigate(`/settings/${id}`)}
        />
        <div className="px-4 py-4 sm:p-6 space-y-6">
          {active === 'system' && (
            <>
              <SystemTab />
              <SectionDivider label="Aparência" />
              <AppearanceTab />
            </>
          )}
          {active === 'integrations' && (
            <>
              <IntegrationsTab />
              <SectionDivider label="Modelos de IA (LLM)" />
              <LLMTab />
            </>
          )}
          {active === 'automations' && <AutomationsTab />}
          {active === 'params'      && <ParamsTab />}
          {active === 'team'        && <TeamTab />}
          {active === 'danger'      && <DangerTab />}
        </div>
      </div>
    </div>
  )
}
