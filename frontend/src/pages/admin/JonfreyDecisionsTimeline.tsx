import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchJonfreyDecisions,
  type JonfreyDecision,
  type JonfreyDecisionsFilter,
} from '../../lib/api/jonfrey'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import {
  pageContainer,
  tblDense,
  thDense,
  tdDense,
  trDense,
} from '../../lib/uiTokens'
import { mythosEmpty, mythosTooltip } from '../../lib/copy/mythos'

// DECISION_TYPE_OPTIONS lista os tipos de decisão conhecidos para o filtro.
const DECISION_TYPE_OPTIONS = [
  '',
  'continue',
  'pause',
  'adjust_cap',
  'escalate_to_human',
  'skip',
]

// decisionBadgeVariant mapeia o tipo de decisão para a variante do Badge.
function decisionBadgeVariant(
  decisionType: string,
): 'danger' | 'warning' | 'success' | 'default' {
  if (decisionType === 'escalate_to_human') {
    return 'danger'
  }
  if (decisionType === 'pause' || decisionType === 'adjust_cap') {
    return 'warning'
  }
  if (decisionType === 'continue') {
    return 'success'
  }
  return 'default'
}

// formatDate formata uma string ISO em data legível.
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(iso))
}

// AntiLoopBanner exibe banner vermelho fixo quando anti-loop disparou em 24h.
function AntiLoopBanner({ count }: { count: number }) {
  if (count === 0) {
    return null
  }

  return (
    <div className="sticky top-0 z-20 w-full bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm font-medium mb-4 flex items-center gap-2">
      <span className="text-base">⚠</span>
      Anti-loop disparou{' '}
      <strong>
        {count} vez{count !== 1 ? 'es' : ''}
      </strong>{' '}
      nas últimas 24h — escalonamento para humano ativo.
    </div>
  )
}

// DecisionRow exibe uma linha da timeline de decisões.
function DecisionRow({ decision }: { decision: JonfreyDecision }) {
  return (
    <tr className={trDense}>
      <td className={`${tdDense} font-mono text-xs text-fg-3`}>{decision.id}</td>
      <td className={`${tdDense} font-mono text-xs`}>{decision.automation_id}</td>
      <td className={tdDense}>
        <Badge variant={decisionBadgeVariant(decision.decision_type)}>
          {decision.decision_type}
        </Badge>
      </td>
      <td className={tdDense}>
        {decision.payload ? (
          <code className="text-xs text-fg-3 font-mono break-all max-w-xs block">
            {JSON.stringify(decision.payload).slice(0, 80)}
            {JSON.stringify(decision.payload).length > 80 ? '…' : ''}
          </code>
        ) : (
          <span className="text-fg-3 text-xs">—</span>
        )}
      </td>
      <td className={`${tdDense} text-xs text-fg-3 whitespace-nowrap`}>
        {formatDate(decision.created_at)}
      </td>
    </tr>
  )
}

// JonfreyDecisionsTimeline é a tela de timeline de decisões do sistema Jonfrey.
export default function JonfreyDecisionsTimeline() {
  const [automationIdFilter, setAutomationIdFilter] = useState('')
  const [decisionTypeFilter, setDecisionTypeFilter] = useState('')

  const filter: JonfreyDecisionsFilter = {
    automation_id: automationIdFilter ? Number(automationIdFilter) : undefined,
    decision_type: decisionTypeFilter || undefined,
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['jonfrey', 'decisions', filter],
    queryFn: () => fetchJonfreyDecisions(filter),
  })

  function renderContent() {
    if (isLoading) {
      return <Skeleton variant="table" rows={8} />
    }

    if (isError) {
      return (
        <EmptyState
          title="Erro ao carregar decisões Jonfrey"
          description="Não foi possível buscar os dados. Verifique o backend."
        />
      )
    }

    const decisions = data?.decisions ?? []

    if (decisions.length === 0) {
      return (
        <EmptyState
          title="Nenhuma decisão registrada"
          description={mythosEmpty.jonfrey}
        />
      )
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className={tblDense}>
          <thead>
            <tr>
              <th className={thDense}>ID</th>
              <th className={thDense}>Automation ID</th>
              <th className={thDense}>Tipo</th>
              <th className={thDense}>Payload</th>
              <th className={thDense}>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((decision) => (
              <DecisionRow key={decision.id} decision={decision} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Decisões Jonfrey" subtitle={mythosTooltip.jonfrey} className="mb-4" />

      {/* Banner anti-loop */}
      {data && <AntiLoopBanner count={data.escalate_count_24h} />}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Filtrar por Automation ID..."
          value={automationIdFilter}
          onChange={(e) => setAutomationIdFilter(e.target.value)}
          className="w-56"
          type="number"
        />
        <select
          className="bg-bg border border-border rounded px-3 py-1 text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          value={decisionTypeFilter}
          onChange={(e) => setDecisionTypeFilter(e.target.value)}
        >
          <option value="">Tipo de decisão (todos)</option>
          {DECISION_TYPE_OPTIONS.filter(Boolean).map((dt) => (
            <option key={dt} value={dt}>
              {dt}
            </option>
          ))}
        </select>
      </div>

      {renderContent()}
    </div>
  )
}
