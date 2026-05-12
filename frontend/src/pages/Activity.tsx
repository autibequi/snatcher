import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button, Input, PageHeader, Tabs } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { filterBar } from '../lib/uiTokens'
import { CrawlLogsTab } from './activity/CrawlLogsTab'
import { JonfreyTab } from './activity/JonfreyTab'
import { LLMTab } from './activity/LLMTab'

// ── Tab definition ────────────────────────────────────────────────────────────

type ActivityTab = 'crawl' | 'jonfrey' | 'llm'

const VALID_TABS = new Set<string>(['crawl', 'jonfrey', 'llm'])

function resolveTab(raw: string | null): ActivityTab {
  if (!raw) return 'crawl'
  // Legacy aliases
  if (raw === 'crawlers') return 'crawl'
  if (VALID_TABS.has(raw)) return raw as ActivityTab
  return 'crawl'
}

const TAB_LIST = [
  { id: 'crawl', label: 'Crawlers' },
  { id: 'jonfrey', label: 'Jonfrey' },
  { id: 'llm', label: 'LLM' },
] as const

// ── Quick stats ───────────────────────────────────────────────────────────────

function QuickStats() {
  const { data: crawlLogs = [] } = useQuery<Array<{ id: number; started_at: string }>>({
    queryKey: ['crawl-logs'],
    queryFn: () =>
      apiClient.get('/api/crawl-logs?limit=100').then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    staleTime: 60_000,
  })

  const { data: jonfreyActions = [] } = useQuery<Array<{ id: number; created_at: string }>>({
    queryKey: ['jonfrey-actions'],
    queryFn: () =>
      apiClient.get('/api/jonfrey/actions').then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    staleTime: 60_000,
  })

  const since24h = Date.now() - 24 * 60 * 60 * 1000
  const c24 = crawlLogs.filter(l => new Date(l.started_at).getTime() > since24h).length
  const j24 = jonfreyActions.filter(a => new Date(a.created_at).getTime() > since24h).length

  return (
    <p className="text-[11px] text-fg-3 mb-1">
      24h: {c24} crawl{c24 !== 1 ? 's' : ''} · {j24} jonfrey run{j24 !== 1 ? 's' : ''}
    </p>
  )
}

// ── Status options per tab ────────────────────────────────────────────────────

const CRAWL_STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'done', label: 'Concluído' },
  { value: 'running', label: 'Rodando' },
  { value: 'error', label: 'Erro' },
]

const JONFREY_STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'success', label: 'Sucesso' },
  { value: 'failed', label: 'Falhou' },
  { value: 'pending', label: 'Pendente' },
  { value: 'running', label: 'Rodando' },
  { value: 'skipped', label: 'Pulado' },
]

function statusOptionsForTab(tab: ActivityTab) {
  if (tab === 'crawl') return CRAWL_STATUSES
  if (tab === 'jonfrey') return JONFREY_STATUSES
  return []
}

// ── CSV Export (shared) ───────────────────────────────────────────────────────

function ExportCsvButton({ tab }: { tab: ActivityTab }) {
  if (tab === 'llm' || tab === 'jonfrey') return null
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        alert('Exportar CSV disponível em breve para esta aba.')
      }}
    >
      Exportar CSV
    </Button>
  )
}

// ── Main Activity page ────────────────────────────────────────────────────────

export default function Activity() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Derive state from URL search params
  const tab = resolveTab(searchParams.get('tab'))
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''

  // Local state for filter inputs (controlled; syncs to URL on change)
  const [localQ, setLocalQ] = React.useState(q)
  const [localStatus, setLocalStatus] = React.useState(status)

  // Sync local state when URL changes externally
  React.useEffect(() => { setLocalQ(searchParams.get('q') ?? '') }, [searchParams])
  React.useEffect(() => { setLocalStatus(searchParams.get('status') ?? '') }, [searchParams])

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setSearchParams(next, { replace: true })
  }

  function handleTabChange(id: string) {
    const next = new URLSearchParams()
    next.set('tab', id)
    setSearchParams(next, { replace: true })
    setLocalQ('')
    setLocalStatus('')
  }

  function handleApplyFilters() {
    updateParams({
      q: localQ,
      status: localStatus,
    })
  }

  function handleClearFilters() {
    setLocalQ('')
    setLocalStatus('')
    const next = new URLSearchParams()
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const statusOptions = statusOptionsForTab(tab)
  const showStatusFilter = statusOptions.length > 0
  const hasActiveFilters = localQ || localStatus

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <PageHeader
          title="Activity"
          subtitle="Hub unificado de logs, disparos e ações automatizadas"
        />
        <QuickStats />
      </div>

      {/* Sticky FilterBar */}
      <div className={filterBar}>
        {/* Search */}
        <div className="flex-1 min-w-[140px] max-w-xs">
          <Input
            placeholder="Buscar..."
            value={localQ}
            onChange={e => setLocalQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
          />
        </div>

        {/* Status select */}
        {showStatusFilter && (
          <select
            value={localStatus}
            onChange={e => setLocalStatus(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {/* Apply / Clear */}
        <Button variant="primary" size="sm" onClick={handleApplyFilters}>
          Filtrar
        </Button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-xs text-fg-3 hover:text-fg px-1"
          >
            Limpar
          </button>
        )}

        {/* Spacer + export */}
        <div className="ml-auto">
          <ExportCsvButton tab={tab} />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4">
        <Tabs
          tabs={TAB_LIST.map(t => ({ id: t.id, label: t.label }))}
          active={tab}
          onChange={handleTabChange}
          className="mt-3"
        />
      </div>

      {/* Tab content */}
      <div className={`flex-1 px-4 py-4 ${tab === 'llm' ? 'max-w-[min(100%,96rem)]' : 'max-w-5xl'} mx-auto w-full`}>
        {tab === 'crawl' && (
          <CrawlLogsTab q={q} status={status} />
        )}
        {tab === 'jonfrey' && (
          <JonfreyTab q={q} status={status} />
        )}
        {tab === 'llm' && (
          <LLMTab q={q} />
        )}
      </div>
    </div>
  )
}
