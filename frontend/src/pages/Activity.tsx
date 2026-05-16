import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button, Input, PageHeader, Tabs, DataTable } from '../components/ui'
import type { ColumnDef } from '@tanstack/react-table'
import { apiClient } from '../lib/apiClient'
import { filterBar } from '../lib/uiTokens'
import { CrawlLogsTab } from './activity/CrawlLogsTab'
import { JonfreyTab } from './activity/JonfreyTab'
import { LLMTab } from './activity/LLMTab'
import { LoopActionsTab } from './activity/LoopActionsTab'
import { AuditTab } from './activity/AuditTab'
import { DispatchRejectionsTab } from './activity/DispatchRejectionsTab'
import { QuarantineEventsTab } from './activity/QuarantineEventsTab'
import { OutboxEventsTab } from './activity/OutboxEventsTab'

// ── Fila de envio ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-warning',
  sending: 'bg-accent animate-pulse',
  sent:    'bg-success',
  failed:  'bg-danger',
}

interface QueueItem {
  id: number
  status: string
  group_name: string
  product_title: string
  score: number
  modem_name?: string
  enqueued_at: string
}

// ── Histórico de disparos (send_log) ─────────────────────────────────────────

interface SendLogItem {
  id: number
  group_id: number
  group_name?: string
  phone?: string
  catalog_id?: number
  product_title?: string
  status: string
  error_code?: string
  sent_at: string
  source?: string
}

const STATUS_LOG_DOT: Record<string, string> = {
  sent:   'bg-success',
  failed: 'bg-danger',
  manual: 'bg-accent',
}

const LOG_COLUMNS: ColumnDef<SendLogItem, unknown>[] = [
  {
    accessorKey: 'status',
    header: '',
    cell: ({ getValue }) => {
      const s = getValue<string>()
      return <span className={`inline-block h-2 w-2 rounded-full ${STATUS_LOG_DOT[s] ?? 'bg-fg-3'}`} title={s} />
    },
  },
  {
    accessorKey: 'source',
    header: 'Tipo',
    cell: ({ getValue }) => {
      const s = getValue<string | undefined>()
      return <span className={`text-xs px-1.5 py-0.5 rounded ${s === 'manual' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-fg-3'}`}>{s === 'manual' ? 'manual' : 'auto'}</span>
    },
  },
  { accessorKey: 'group_name', header: 'Grupo', cell: ({ getValue }) => <span className="font-medium">{getValue<string>() ?? '—'}</span> },
  {
    accessorKey: 'product_title',
    header: 'Produto',
    cell: ({ getValue, row }) => {
      const title = getValue<string>()
      const err = (row.original as SendLogItem).error_code
      const [expanded, setExpanded] = React.useState(false)
      return (
        <div className="max-w-sm">
          <span className="text-fg-2 text-xs truncate block" title={title ?? undefined}>{title ?? '—'}</span>
          {err && (
            <button
              type="button"
              className="text-left w-full"
              onClick={() => setExpanded(e => !e)}
            >
              <span className="text-danger text-xs block">
                ⚠ {expanded ? err : err.slice(0, 60) + (err.length > 60 ? '…' : '')}
              </span>
            </button>
          )}
        </div>
      )
    },
  },
  { accessorKey: 'phone', header: 'Conta', cell: ({ getValue }) => <span className="text-fg-3 text-xs font-mono">{getValue<string>() ?? '—'}</span> },
  {
    accessorKey: 'sent_at',
    header: 'Enviado em',
    cell: ({ getValue }) => (
      <span className="text-xs text-fg-3 whitespace-nowrap">
        {new Date(getValue<string>()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
    ),
  },
]

function DispatchesTab() {
  const [statusFilter, setStatusFilter] = React.useState('')
  const { data: items = [], isFetching, refetch } = useQuery<SendLogItem[]>({
    queryKey: ['send-log', statusFilter],
    queryFn: () =>
      apiClient
        .get(`/api/admin/send-log?limit=200${statusFilter ? `&status=${statusFilter}` : ''}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 15_000,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1.5">
          {(['', 'sent', 'failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                statusFilter === s ? 'bg-accent text-white border-accent' : 'bg-surface text-fg-3 border-border hover:border-accent/50',
              ].join(' ')}
            >
              {s === '' ? 'Todos' : s}
            </button>
          ))}
        </div>
        <button onClick={() => refetch()} className="text-xs text-accent hover:underline">
          {isFetching ? 'atualizando…' : '↻ atualizar'}
        </button>
      </div>

      <DataTable
        data={items}
        columns={LOG_COLUMNS}
        pageSize={20}
        emptyMessage="Nenhum disparo registrado ainda."
      />
    </div>
  )
}

const QUEUE_COLUMNS: ColumnDef<QueueItem, unknown>[] = [
  {
    accessorKey: 'status',
    header: '',
    cell: ({ getValue }) => {
      const s = getValue<string>()
      const dot = STATUS_DOT[s] ?? 'bg-fg-3'
      return <span className={`inline-block h-2 w-2 rounded-full ${dot}`} title={s} />
    },
  },
  { accessorKey: 'group_name', header: 'Grupo', cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
  {
    accessorKey: 'product_title',
    header: 'Produto',
    cell: ({ getValue }) => {
      const v = getValue<string>()
      return <span className="truncate max-w-xs block text-fg-2" title={v}>{v}</span>
    },
  },
  { accessorKey: 'score', header: 'Score', cell: ({ getValue }) => <span className="font-mono text-xs text-fg-3">{getValue<number>().toFixed(3)}</span> },
  { accessorKey: 'modem_name', header: 'Modem', cell: ({ getValue }) => <span className="text-xs text-fg-3">{getValue<string>() ?? '—'}</span> },
  {
    accessorKey: 'enqueued_at',
    header: 'Enfileirado',
    cell: ({ getValue }) => (
      <span className="text-xs text-fg-3 whitespace-nowrap">
        {new Date(getValue<string>()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    ),
  },
]

function SendQueueTab() {
  const [statusFilter, setStatusFilter] = React.useState('')

  const { data: items = [], isFetching, refetch } = useQuery<QueueItem[]>({
    queryKey: ['send-queue', statusFilter],
    queryFn: () =>
      apiClient
        .get(`/api/admin/send-queue?limit=100${statusFilter ? `&status=${statusFilter}` : ''}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 10_000,
  })

  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Filtros + resumo */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1.5">
          {(['', 'pending', 'sending', 'sent', 'failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                statusFilter === s
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-fg-3 border-border hover:border-accent/50',
              ].join(' ')}
            >
              {s === '' ? 'Todos' : s}
              {s !== '' && counts[s] !== undefined ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-accent hover:underline"
        >
          {isFetching ? 'atualizando…' : '↻ atualizar'}
        </button>
      </div>

      {/* Tabela */}
      <DataTable
        data={items}
        columns={QUEUE_COLUMNS}
        pageSize={0}
        emptyMessage={statusFilter ? `Nenhum item com status "${statusFilter}"` : 'Fila vazia'}
      />
    </div>
  )
}

// ── Tab definition ────────────────────────────────────────────────────────────

type ActivityTab = 'queue' | 'dispatches' | 'rejections' | 'quarantine' | 'outbox' | 'crawl' | 'jonfrey' | 'loops' | 'llm' | 'audit'

const VALID_TABS = new Set<string>(['queue', 'dispatches', 'crawl', 'jonfrey', 'loops', 'llm', 'audit'])

function resolveTab(raw: string | null): ActivityTab {
  if (!raw) return 'dispatches'
  if (raw === 'crawlers') return 'crawl'
  if (VALID_TABS.has(raw)) return raw as ActivityTab
  return 'dispatches'
}

const TAB_LIST = [
  { id: 'dispatches', label: 'Disparos' },
  { id: 'queue',      label: 'Fila' },
  { id: 'rejections', label: 'Rejeições' },
  { id: 'quarantine', label: 'Quarentena' },
  { id: 'outbox',     label: 'Outbox' },
  { id: 'crawl',      label: 'Crawlers' },
  { id: 'jonfrey',    label: 'Jonfrey' },
  { id: 'loops',      label: 'Loops LLM' },
  { id: 'llm',        label: 'LLM' },
  { id: 'audit',      label: 'Auditoria' },
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

const AUDIT_STATUSES = [
  { value: '',             label: 'Todos' },
  { value: 'llm_action',   label: 'Ação LLM' },
  { value: 'system_pause', label: 'Pausa sistema' },
  { value: 'ban_event',    label: 'Ban detectado' },
]

function statusOptionsForTab(tab: ActivityTab) {
  if (tab === 'crawl')  return CRAWL_STATUSES
  if (tab === 'jonfrey') return JONFREY_STATUSES
  if (tab === 'audit')  return AUDIT_STATUSES
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
        {tab === 'dispatches' && (
          <DispatchesTab />
        )}
        {tab === 'queue' && (
          <SendQueueTab />
        )}
        {tab === 'rejections' && (
          <DispatchRejectionsTab />
        )}
        {tab === 'quarantine' && (
          <QuarantineEventsTab />
        )}
        {tab === 'outbox' && (
          <OutboxEventsTab />
        )}
        {tab === 'crawl' && (
          <CrawlLogsTab q={q} status={status} />
        )}
        {tab === 'jonfrey' && (
          <JonfreyTab q={q} status={status} />
        )}
        {tab === 'loops' && (
          <LoopActionsTab q={q} />
        )}
        {tab === 'llm' && (
          <LLMTab q={q} />
        )}
        {tab === 'audit' && (
          <AuditTab q={q} status={status} />
        )}
      </div>
    </div>
  )
}
