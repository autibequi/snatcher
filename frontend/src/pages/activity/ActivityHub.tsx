import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CrawlLogsTab } from './CrawlLogsTab'
import { SendEventsTab } from './SendEventsTab'
import { QuarantineEventsTab } from './QuarantineEventsTab'
import { OutboxEventsTab } from './OutboxEventsTab'
import { LLMTab } from './LLMTab'
import { useWSEvent } from '../../lib/useWS'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Tab identifiers for the ActivityHub */
type TabID = 'crawl' | 'send' | 'quarantine' | 'outbox' | 'llm'

/** Common filters shared across all activity tabs */
export interface CommonFilters {
  /** ISO date string — start of range */
  from?: string
  /** ISO date string — end of range */
  to?: string
  /** Channel ID to filter by */
  channel?: string
  /** Severity level filter */
  severity?: string
  /** Free-text search across the tab's data */
  text?: string
}

// ── Tab list ──────────────────────────────────────────────────────────────────

const TAB_LIST: Array<{ id: TabID; label: string }> = [
  { id: 'crawl',      label: 'Crawl Logs'  },
  { id: 'send',       label: 'Envios'      },
  { id: 'quarantine', label: 'Quarentena'  },
  { id: 'llm',        label: 'LLM Calls'   },
  { id: 'outbox',     label: 'Outbox'      },
]

// ── Severity options ───────────────────────────────────────────────────────────

const SEVERITY_OPTIONS = [
  { value: '',        label: 'Todos' },
  { value: 'info',    label: 'Info'  },
  { value: 'warning', label: 'Aviso' },
  { value: 'error',   label: 'Erro'  },
]

// ── FilterBar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
  value: CommonFilters
  onChange: (updated: CommonFilters) => void
}

/** Shared filter bar with date-range, channel_id, severity and free-text inputs */
function FilterBar({ value, onChange }: FilterBarProps) {
  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, from: e.target.value || undefined })
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, to: e.target.value || undefined })
  }

  function handleChannelChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, channel: e.target.value || undefined })
  }

  function handleSeverityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange({ ...value, severity: e.target.value || undefined })
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, text: e.target.value || undefined })
  }

  function handleClear() {
    onChange({})
  }

  const hasActiveFilters = value.from || value.to || value.text || value.channel || value.severity

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {/* Date range */}
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

      {/* Channel ID */}
      <input
        type="text"
        value={value.channel ?? ''}
        onChange={handleChannelChange}
        placeholder="Channel ID..."
        title="Filtrar por channel_id"
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg w-[120px]"
      />

      {/* Severity */}
      <select
        value={value.severity ?? ''}
        onChange={handleSeverityChange}
        title="Severidade"
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
      >
        {SEVERITY_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Free-text search */}
      <input
        type="text"
        value={value.text ?? ''}
        onChange={handleTextChange}
        placeholder="Busca livre..."
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg min-w-[160px]"
      />

      {/* Clear all */}
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
    // Pass text filter as the q prop; date-range consumed via filters prop
    return <CrawlLogsTab filters={filters} q={filters.text} />
  }
  if (tab === 'send') {
    return <SendEventsTab filters={filters} />
  }
  if (tab === 'quarantine') {
    return <QuarantineEventsTab />
  }
  if (tab === 'outbox') {
    return <OutboxEventsTab />
  }
  if (tab === 'llm') {
    // LLMTab aceita q opcional; filters.text passado como busca livre.
    // Restante de CommonFilters (date-range, channel, severity) ignorado por LLMTab nesta wave.
    return <LLMTab q={filters.text} />
  }
  return null
}

// ── ActivityHub ───────────────────────────────────────────────────────────────

/**
 * Consolidated activity log hub with tabs for crawl logs, send events,
 * quarantine events, outbox events and LLM calls.
 * A shared FilterBar (date-range, channel_id, severity, free-text) sits above the tabs.
 * WS live invalidation: crawler.run_completed → crawl; dispatch.* → send/outbox.
 */
export function ActivityHub() {
  const [tab, setTab] = useState<TabID>('crawl')
  const [filters, setFilters] = useState<CommonFilters>({})
  const queryClient = useQueryClient()

  // Invalidar tab crawl quando o crawler termina uma execução
  useWSEvent('crawler.run_completed', () => {
    if (tab === 'crawl') {
      void queryClient.invalidateQueries({ queryKey: ['crawl-logs'] })
    }
  })

  // Invalidar tab send quando um dispatch é concluído ou um alvo atualizado
  useWSEvent('dispatch.completed', () => {
    if (tab === 'send') {
      void queryClient.invalidateQueries({ queryKey: ['send-queue'] })
      void queryClient.invalidateQueries({ queryKey: ['send-log'] })
    }
    if (tab === 'outbox') {
      void queryClient.invalidateQueries({ queryKey: ['outbox-events'] })
    }
  })

  useWSEvent('dispatch.target_updated', () => {
    if (tab === 'send') {
      void queryClient.invalidateQueries({ queryKey: ['send-queue'] })
      void queryClient.invalidateQueries({ queryKey: ['send-log'] })
    }
  })

  function handleTabSelect(newTab: TabID) {
    setTab(newTab)
    // Reset filters when switching tabs to avoid carrying stale filter state
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
