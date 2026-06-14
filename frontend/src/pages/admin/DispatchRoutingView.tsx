import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchModemRouting,
  toggleRouting,
  fetchRateBuckets,
  type ModemRoutingRow,
  type RateBucketRow,
  type RateBucketScopeType,
} from '../../lib/api/dispatch'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import {
  pageContainer,
  tblDense,
  thDense,
  thDenseRight,
  tdDense,
  tdDenseRight,
  trDense,
  sectionCard,
} from '../../lib/uiTokens'
import { mythosEmpty, mythosTooltip } from '../../lib/copy/mythos'

// ─── shared helpers ────────────────────────────────────────────────────────────

// formatDate formata uma string ISO em data legível ou retorna '—' se ausente.
function formatDate(iso?: string): string {
  if (!iso) {
    return '—'
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

// ─── RoutingTab ────────────────────────────────────────────────────────────────

// ToggleButton exibe o botão de toggle de afinidade com estado de loading.
function ToggleButton({
  row,
  isLoading,
  onToggle,
}: {
  row: ModemRoutingRow
  isLoading: boolean
  onToggle: (row: ModemRoutingRow) => void
}) {
  return (
    <Button
      variant={row.enabled ? 'danger' : 'primary'}
      size="sm"
      loading={isLoading}
      onClick={() => onToggle(row)}
    >
      {row.enabled ? 'Desativar' : 'Ativar'}
    </Button>
  )
}

// RoutingTable exibe a tabela de entradas modem × domain.
function RoutingTable({
  rows,
  pendingKey,
  onToggle,
}: {
  rows: ModemRoutingRow[]
  pendingKey: string | null
  onToggle: (row: ModemRoutingRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className={tblDense}>
        <thead>
          <tr>
            <th className={thDense}>Modem ID</th>
            <th className={thDense}>Domain ID</th>
            <th className={thDense}>Domain</th>
            <th className={thDenseRight}>Affinity</th>
            <th className={thDense}>Status</th>
            <th className={thDense}>Último uso</th>
            <th className={thDense}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKey = `${row.modem_id}-${row.domain_id}`
            const isPending = pendingKey === rowKey

            return (
              <tr key={rowKey} className={trDense}>
                <td className={`${tdDense} font-mono text-xs`}>{row.modem_id}</td>
                <td className={`${tdDense} font-mono text-xs`}>{row.domain_id}</td>
                <td className={tdDense}>{row.domain_name ?? '—'}</td>
                <td className={tdDenseRight}>{row.affinity_score.toFixed(3)}</td>
                <td className={tdDense}>
                  <Badge variant={row.enabled ? 'success' : 'default'}>
                    {row.enabled ? 'ativo' : 'inativo'}
                  </Badge>
                </td>
                <td className={tdDense}>{formatDate(row.last_used_at)}</td>
                <td className={tdDense}>
                  <ToggleButton row={row} isLoading={isPending} onToggle={onToggle} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// RoutingTab é o conteúdo da aba "Roteamento por Modem".
function RoutingTab() {
  const [modemFilter, setModemFilter] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dispatch', 'routing'],
    queryFn: fetchModemRouting,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ modemID, domainID, enabled }: { modemID: number; domainID: number; enabled: boolean }) =>
      toggleRouting(modemID, domainID, enabled),
    onSettled: () => {
      setPendingKey(null)
      qc.invalidateQueries({ queryKey: ['dispatch', 'routing'] })
    },
  })

  // handleToggle dispara a mutação de toggle de afinidade para um par modem × domain.
  function handleToggle(row: ModemRoutingRow) {
    const key = `${row.modem_id}-${row.domain_id}`
    setPendingKey(key)
    toggleMutation.mutate({
      modemID: row.modem_id,
      domainID: row.domain_id,
      enabled: !row.enabled,
    })
  }

  function renderContent() {
    if (isLoading) {
      return <Skeleton variant="table" rows={8} />
    }

    if (isError) {
      return (
        <EmptyState
          title="Erro ao carregar roteamento"
          description="Não foi possível buscar os dados de roteamento. Verifique o backend."
        />
      )
    }

    const filtered = modemFilter
      ? (data ?? []).filter((row) => String(row.modem_id).includes(modemFilter))
      : (data ?? [])

    if (filtered.length === 0) {
      return (
        <EmptyState
          title="Nenhuma entrada de roteamento encontrada"
          description={mythosEmpty.routing}
        />
      )
    }

    return (
      <RoutingTable rows={filtered} pendingKey={pendingKey} onToggle={handleToggle} />
    )
  }

  return (
    <div>
      {/* Filtro por modem_id */}
      <div className="mb-4">
        <Input
          placeholder="Filtrar por Modem ID..."
          value={modemFilter}
          onChange={(e) => setModemFilter(e.target.value)}
          className="w-56"
        />
      </div>

      {renderContent()}
    </div>
  )
}

// ─── RateBucketsTab ────────────────────────────────────────────────────────────

// SCOPE_TYPES lista os tipos de escopo disponíveis nos filtros.
const SCOPE_TYPES: (RateBucketScopeType | 'all')[] = ['all', 'group', 'channel', 'modem']

const SCOPE_LABELS: Record<RateBucketScopeType | 'all', string> = {
  all: 'Todos',
  group: 'Grupo',
  channel: 'Canal',
  modem: 'Modem',
}

// scopeBadgeVariant mapeia o tipo de escopo para a variante do Badge.
function scopeBadgeVariant(scope: RateBucketScopeType): 'accent' | 'success' | 'warning' {
  const map: Record<RateBucketScopeType, 'accent' | 'success' | 'warning'> = {
    group: 'accent',
    channel: 'success',
    modem: 'warning',
  }
  return map[scope]
}

// TimelinePlaceholder exibe a tabela de drain ao longo do tempo (placeholder).
function TimelinePlaceholder({ rows }: { rows: RateBucketRow[] }) {
  // Ordenamos por refilled_at (mais recente primeiro) como aproximação de timeline
  const sorted = [...rows]
    .filter((row) => row.refilled_at !== undefined)
    .sort((a, b) => {
      const dateA = new Date(a.refilled_at!).getTime()
      const dateB = new Date(b.refilled_at!).getTime()
      return dateB - dateA
    })
    .slice(0, 10)

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-fg-3">Sem dados de timeline disponíveis (refilled_at ausente).</p>
    )
  }

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className={tblDense}>
        <thead>
          <tr>
            <th className={thDense}>Escopo</th>
            <th className={thDense}>ID</th>
            <th className={thDenseRight}>Tokens restantes</th>
            <th className={thDenseRight}>Capacidade</th>
            <th className={thDense}>Reabastecido em</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className={trDense}>
              <td className={tdDense}>
                <Badge variant={scopeBadgeVariant(row.scope_type)} size="sm">
                  {SCOPE_LABELS[row.scope_type]}
                </Badge>
              </td>
              <td className={`${tdDense} font-mono text-xs`}>{row.scope_id}</td>
              <td className={tdDenseRight}>{row.current_tokens}</td>
              <td className={tdDenseRight}>{row.tokens_per_minute}</td>
              <td className={tdDense}>{formatDate(row.refilled_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// TokenDrainBar exibe uma barra de progresso visual dos tokens restantes.
function TokenDrainBar({ current, max }: { current: number; max: number }) {
  if (max === 0) {
    return <span className="text-fg-3 text-xs">—</span>
  }

  const pct = Math.min(100, Math.round((current / max) * 100))
  const colorClass =
    pct > 60
      ? 'bg-success'
      : pct > 30
      ? 'bg-warning'
      : 'bg-danger'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface-2 rounded-full h-1.5 min-w-[60px]">
        <div
          className={`${colorClass} h-1.5 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-fg-3 shrink-0">{pct}%</span>
    </div>
  )
}

// RateBucketsTab é o conteúdo da aba "Rate Buckets".
function RateBucketsTab() {
  const [scopeFilter, setScopeFilter] = useState<RateBucketScopeType | 'all'>('all')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dispatch', 'rate-buckets'],
    queryFn: fetchRateBuckets,
    refetchInterval: 15000,
  })

  function renderContent() {
    if (isLoading) {
      return <Skeleton variant="table" rows={8} />
    }

    if (isError) {
      return (
        <EmptyState
          title="Erro ao carregar rate buckets"
          description="Não foi possível buscar os dados. Verifique o backend."
        />
      )
    }

    const filtered =
      scopeFilter === 'all'
        ? (data ?? [])
        : (data ?? []).filter((row) => row.scope_type === scopeFilter)

    if (filtered.length === 0) {
      return (
        <EmptyState
          title="Nenhum rate bucket encontrado"
          description={mythosEmpty.rateBuckets}
        />
      )
    }

    return (
      <div className="space-y-6">
        {/* Tabela principal */}
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className={tblDense}>
            <thead>
              <tr>
                <th className={thDense}>Escopo</th>
                <th className={thDense}>Scope ID</th>
                <th className={thDenseRight}>Tokens/min</th>
                <th className={thDenseRight}>Tokens atuais</th>
                <th className={thDense}>Drain</th>
                <th className={thDense}>Reabastecido em</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className={trDense}>
                  <td className={tdDense}>
                    <Badge variant={scopeBadgeVariant(row.scope_type)} size="sm">
                      {SCOPE_LABELS[row.scope_type]}
                    </Badge>
                  </td>
                  <td className={`${tdDense} font-mono text-xs`}>{row.scope_id}</td>
                  <td className={tdDenseRight}>{row.tokens_per_minute}</td>
                  <td className={tdDenseRight}>{row.current_tokens}</td>
                  <td className={tdDense}>
                    <TokenDrainBar current={row.current_tokens} max={row.tokens_per_minute} />
                  </td>
                  <td className={tdDense}>{formatDate(row.refilled_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Timeline placeholder */}
        <div className={sectionCard}>
          <h3 className="text-sm font-semibold text-fg mb-3" title={mythosTooltip.rateBuckets}>
            Timeline de drain (últimas recargas)
          </h3>
          <TimelinePlaceholder rows={filtered} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Filtro por scope_type */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SCOPE_TYPES.map((scope) => (
          <button
            key={scope}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium ${scopeFilter === scope ? 'bg-accent text-bg' : 'bg-surface-2 text-fg-2 hover:bg-surface-3'}`}
            onClick={() => setScopeFilter(scope)}
          >
            {SCOPE_LABELS[scope]}
          </button>
        ))}
      </div>

      {renderContent()}
    </div>
  )
}

// ─── tab definitions ───────────────────────────────────────────────────────────

type DispatchTab = 'routing' | 'rate-buckets'

const DISPATCH_TABS = [
  { id: 'routing',      label: 'Roteamento'   },
  { id: 'rate-buckets', label: 'Rate Buckets' },
]

// ─── DispatchRoutingView ───────────────────────────────────────────────────────

// DispatchRoutingView é a tela unificada de Roteamento e Rate Buckets.
// A aba ativa é controlada pelo search param `tab` (padrão: routing).
export default function DispatchRoutingView() {
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: DispatchTab = rawTab === 'rate-buckets' ? 'rate-buckets' : 'routing'

  // setActiveTab atualiza o search param `tab`; 'routing' limpa o param para URL limpa.
  function setActiveTab(id: string) {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        if (id === 'routing') {
          next.delete('tab')
        } else {
          next.set('tab', id)
        }
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Roteamento" className="mb-4" />

      <Tabs
        tabs={DISPATCH_TABS}
        active={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />

      {activeTab === 'routing' && <RoutingTab />}
      {activeTab === 'rate-buckets' && <RateBucketsTab />}
    </div>
  )
}
