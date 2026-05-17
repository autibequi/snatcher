import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '../../lib/api/observability'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { sectionCard, sectionHeader, sectionTitle } from '../../lib/uiTokens'
import { mythosTooltip } from '../../lib/copy/mythos'

// circuitBreakerVariant mapeia o estado do circuit breaker para a variante do Badge.
function circuitBreakerVariant(state: string): 'ok' | 'warn' | 'error' {
  if (state === 'closed') {
    return 'ok'
  }
  if (state === 'open') {
    return 'error'
  }
  return 'warn'
}

// DispatcherCard exibe fila e workers ativos do dispatcher.
function DispatcherCard({ queueDepth, activeWorkers }: { queueDepth: number; activeWorkers: number }) {
  return (
    <div className={sectionCard}>
      <div className={sectionHeader}>
        <span className={sectionTitle} title={mythosTooltip.observability}>Dispatcher</span>
      </div>
      <div className="flex gap-8 text-sm">
        <div>
          <p className="text-xs text-fg-3 mb-1">Fila pendente</p>
          <p className="text-2xl font-bold tabular-nums">{queueDepth}</p>
        </div>
        <div>
          <p className="text-xs text-fg-3 mb-1">Workers ativos</p>
          <p className="text-2xl font-bold tabular-nums">{activeWorkers}</p>
        </div>
      </div>
    </div>
  )
}

// LLMCard exibe o custo acumulado de LLM no dia.
function LLMCard({ costTodayUsd }: { costTodayUsd: number }) {
  return (
    <div className={sectionCard}>
      <div className={sectionHeader}>
        <span className={sectionTitle}>LLM — custo hoje</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">${costTodayUsd.toFixed(4)}</p>
      <p className="text-xs text-fg-3 mt-1">USD total acumulado no dia</p>
    </div>
  )
}

// CircuitBreakersCard exibe o grid de upstreams com badge de estado.
function CircuitBreakersCard({ breakers }: { breakers: Record<string, string> }) {
  const entries = Object.entries(breakers)

  return (
    <div className={sectionCard}>
      <div className={sectionHeader}>
        <span className={sectionTitle} title={mythosTooltip.circuitBreaker}>Circuit Breakers</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-fg-3">Nenhum upstream monitorado.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([upstream, state]) => (
            <li key={upstream} className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm text-fg">{upstream}</span>
              <Badge variant={circuitBreakerVariant(state)}>{state}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// CatalogCard exibe a distribuição de status do catálogo.
function CatalogCard({ catalog }: { catalog: Record<string, number> }) {
  const entries = Object.entries(catalog)

  return (
    <div className={sectionCard}>
      <div className={sectionHeader}>
        <span className={sectionTitle}>Catálogo — distribuição</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-fg-3">Sem dados de catálogo.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([status, count]) => (
            <li key={status} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-mono text-fg">{status}</span>
              <span className="font-semibold tabular-nums text-fg-2">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// AdminObservabilityPanel é o painel TanStack Query-based de observabilidade do sistema.
// Renderizado como aba dentro de AdminObservability (pages/AdminObservability.tsx).
export function AdminObservabilityPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['observability', 'health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-32" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <EmptyState
        title="Sem dados de observabilidade"
        description="O endpoint de health não respondeu ou retornou um erro. Verifique o backend."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DispatcherCard
          queueDepth={data.dispatcher.queue_depth}
          activeWorkers={data.dispatcher.active_workers}
        />
        <LLMCard costTodayUsd={data.llm.cost_today_usd_total} />
      </div>
      <CircuitBreakersCard breakers={data.circuit_breaker} />
      <CatalogCard catalog={data.catalog} />
    </div>
  )
}
