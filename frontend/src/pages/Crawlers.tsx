import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Tabs } from '../components/ui'
import { pageContainer } from '../lib/uiTokens'

import { MarketplaceTab, CreateMarketplaceModal, SuggestCrawlerModal } from './crawlers/MarketplaceTab'
import { GroupSpyTab, CreateSpyModal } from './crawlers/GroupSpyTab'

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'marketplace', label: 'Marketplaces' },
  { id: 'group-spy',   label: 'Grupos concorrentes' },
]

// ── Crawlers hub shell ────────────────────────────────────────────────────────

export default function Crawlers() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-synced tab: /crawlers?tab=marketplace | group-spy
  const rawTab = searchParams.get('tab') ?? 'marketplace'
  const tab = TABS.some(t => t.id === rawTab) ? rawTab : 'marketplace'

  function handleTabChange(id: string) {
    setSearchParams({ tab: id }, { replace: true })
    // Reset modal state when switching tabs
    setShowMarketplaceModal(false)
    setShowSpyModal(false)
    setShowSuggestModal(false)
  }

  const [showMarketplaceModal, setShowMarketplaceModal] = React.useState(false)
  const [showSpyModal, setShowSpyModal] = React.useState(false)
  const [showSuggestModal, setShowSuggestModal] = React.useState(false)

  // Per-tab actions shown in PageHeader
  const actions =
    tab === 'marketplace' ? (
      <>
        <Button variant="secondary" size="sm" onClick={() => setShowSuggestModal(true)}>
          Sugerir com IA
        </Button>
        <Button variant="primary" size="sm" onClick={() => setShowMarketplaceModal(true)}>
          + Novo crawler
        </Button>
      </>
    ) : (
      <Button variant="primary" size="sm" onClick={() => setShowSpyModal(true)}>
        + Adicionar grupo
      </Button>
    )

  return (
    <div className={pageContainer}>
      <div className="mb-5">
        <PageHeader
          title="Crawlers"
          subtitle={tab === 'marketplace' ? 'Monitoramento de produtos em marketplaces' : 'Espionagem de grupos de promo concorrentes'}
          actions={actions}
        />
      </div>

      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <Tabs
          tabs={TABS}
          active={tab}
          onChange={handleTabChange}
        />

        {tab === 'marketplace' ? (
          <MarketplaceTab
            onNew={() => setShowMarketplaceModal(true)}
            onSuggest={() => setShowSuggestModal(true)}
          />
        ) : (
          <GroupSpyTab
            onNew={() => setShowSpyModal(true)}
          />
        )}
      </div>

      {/* Modals */}
      <CreateMarketplaceModal
        open={showMarketplaceModal}
        onClose={() => setShowMarketplaceModal(false)}
      />
      <CreateSpyModal
        open={showSpyModal}
        onClose={() => setShowSpyModal(false)}
      />
      {showSuggestModal && (
        <SuggestCrawlerModal
          onClose={() => setShowSuggestModal(false)}
          onCreated={() => {
            setShowSuggestModal(false)
            qc.invalidateQueries({ queryKey: ['search-terms'] })
          }}
        />
      )}
    </div>
  )
}
