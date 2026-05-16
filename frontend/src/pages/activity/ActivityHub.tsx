import { useState } from 'react'
import { CrawlLogsTab } from './CrawlLogsTab'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Tab identifiers for the ActivityHub */
type TabID = 'crawl' | 'send' | 'quarantine' | 'llm' | 'outbox'

/** Common filters shared across all activity tabs */
export interface CommonFilters {
  /** ISO date string — start of range */
  from?: string
  /** ISO date string — end of range */
  to?: string
  /** Channel ID or name to filter by */
  channel?: string
  /** Free-text search across the tab's data */
  text?: string
}

// ── Tab list ──────────────────────────────────────────────────────────────────

const TAB_LIST: Array<{ id: TabID; label: string }> = [
  { id: 'crawl',      label: 'Crawl Logs'   },
  { id: 'send',       label: 'Send Events'  },
  { id: 'quarantine', label: 'Quarantine'   },
  { id: 'llm',        label: 'LLM Calls'    },
  { id: 'outbox',     label: 'Outbox'       },
]

// ── FilterBar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
  value: CommonFilters
  onChange: (updated: CommonFilters) => void
}

/** Shared filter bar with date-range and free-text search inputs */
function FilterBar({ value, onChange }: FilterBarProps) {
  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, from: e.target.value || undefined })
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, to: e.target.value || undefined })
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, text: e.target.value || undefined })
  }

  function handleClear() {
    onChange({})
  }

  const hasActiveFilters = value.from || value.to || value.text || value.channel

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        type="date"
        value={value.from ?? ''}
        onChange={handleFromChange}
        title="Data inicial"
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
      />
      <span className="text-fg-3 text-xs">até</span>
      <input
        type="date"
        value={value.to ?? ''}
        onChange={handleToChange}
        title="Data final"
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
      />
      <input
        type="text"
        value={value.text ?? ''}
        onChange={handleTextChange}
        placeholder="Busca livre..."
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg min-w-[160px]"
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-fg-3 hover:text-fg px-1 underline-offset-2 hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}

// ── Stub tabs ─────────────────────────────────────────────────────────────────
// Each stub renders a placeholder until the real endpoint exists in future waves.

/** Placeholder for the Send Events tab (endpoint in future wave) */
function SendEventsTab({ filters }: { filters: CommonFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <p className="text-fg-2 font-medium">Send Events</p>
      <p className="text-fg-3 text-sm">Endpoint disponível em wave futura.</p>
      {filters.text && (
        <p className="text-xs text-fg-3 font-mono">
          filtro ativo: "{filters.text}"
        </p>
      )}
    </div>
  )
}

/** Placeholder for the Quarantine tab (endpoint in future wave) */
function QuarantineTab({ filters: _filters }: { filters: CommonFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <p className="text-fg-2 font-medium">Quarantine</p>
      <p className="text-fg-3 text-sm">Endpoint disponível em wave futura.</p>
    </div>
  )
}

/** Placeholder for the LLM Calls tab (endpoint in future wave) */
function LLMCallsTab({ filters: _filters }: { filters: CommonFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <p className="text-fg-2 font-medium">LLM Calls</p>
      <p className="text-fg-3 text-sm">Endpoint disponível em wave futura.</p>
    </div>
  )
}

/** Placeholder for the Outbox tab (endpoint in future wave) */
function OutboxTab({ filters: _filters }: { filters: CommonFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <p className="text-fg-2 font-medium">Outbox Events</p>
      <p className="text-fg-3 text-sm">Endpoint disponível em wave futura.</p>
    </div>
  )
}

// ── Tab navigation ────────────────────────────────────────────────────────────

interface TabNavProps {
  active: TabID
  onSelect: (tab: TabID) => void
}

/** Horizontal tab navigation bar */
function TabNav({ active, onSelect }: TabNavProps) {
  return (
    <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
      {TAB_LIST.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === tab.id
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-3 hover:text-fg hover:border-border',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

// ── Tab content router ────────────────────────────────────────────────────────

interface TabContentProps {
  tab: TabID
  filters: CommonFilters
}

/** Routes to the correct tab component based on active tab ID */
function TabContent({ tab, filters }: TabContentProps) {
  if (tab === 'crawl') {
    // Pass text filter as the q prop; date-range not yet consumed by CrawlLogsTab
    return <CrawlLogsTab filters={filters} q={filters.text} />
  }
  if (tab === 'send') {
    return <SendEventsTab filters={filters} />
  }
  if (tab === 'quarantine') {
    return <QuarantineTab filters={filters} />
  }
  if (tab === 'llm') {
    return <LLMCallsTab filters={filters} />
  }
  if (tab === 'outbox') {
    return <OutboxTab filters={filters} />
  }
  return null
}

// ── ActivityHub ───────────────────────────────────────────────────────────────

/**
 * Consolidated activity log hub with 5 tabs (Crawl / Send / Quarantine / LLM / Outbox)
 * and a shared FilterBar (date-range + free-text).
 */
export function ActivityHub() {
  const [tab, setTab] = useState<TabID>('crawl')
  const [filters, setFilters] = useState<CommonFilters>({})

  function handleTabSelect(newTab: TabID) {
    setTab(newTab)
    // Reset filters when switching tabs to avoid stale filter state
    setFilters({})
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <header className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fg">Atividade</h2>
        <FilterBar value={filters} onChange={setFilters} />
        <TabNav active={tab} onSelect={handleTabSelect} />
      </header>

      {/* Active tab content */}
      <div className="flex-1">
        <TabContent tab={tab} filters={filters} />
      </div>
    </div>
  )
}
