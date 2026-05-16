import { useSearchParams } from 'react-router-dom'
import { Tabs } from '../components/ui'
import { PageHeader } from '../components/ui/PageHeader'
import { pageContainer } from '../lib/uiTokens'
import { SystemHealth } from './admin/SystemHealth'
import { BaselineTab } from './admin/BaselineTab'

const TABS = [
  { id: 'health',    label: 'Pulso do Sistema' },
  { id: 'baseline',  label: 'Baseline T-0' },
]

export default function AdminObservability() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = TABS.some(t => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')!
    : 'health'

  return (
    <div className={pageContainer}>
      <PageHeader title="Observabilidade" className="mb-4" />
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <Tabs
          tabs={TABS}
          active={active}
          onChange={id => setSearchParams({ tab: id })}
        />
        <div className="px-4 py-4 sm:p-6">
          {active === 'health'   && <SystemHealth />}
          {active === 'baseline' && <BaselineTab />}
        </div>
      </div>
    </div>
  )
}
