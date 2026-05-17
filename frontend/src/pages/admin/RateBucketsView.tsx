import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchRateBuckets,
  type RateBucketRow,
  type RateBucketScopeType,
} from '../../lib/api/dispatch'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
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

// RateBucketsView é a tela de visualização dos rate buckets por escopo.
export default function RateBucketsView() {
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
    <div className={pageContainer}>
      <PageHeader title="Rate Buckets" className="mb-4" />

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
