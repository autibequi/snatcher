import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, EmptyState, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import {
  JonfreyActionCard,
  primaryJonfreyOutcome,
  type JonfreyAction,
} from '../../components/JonfreyActionCard'

// ── Failures Alert ────────────────────────────────────────────────────────────

function JonfreyFailuresAlert({ actions }: { actions: JonfreyAction[] }) {
  const failedJonfrey = actions.filter(a => a.status === 'failed')
  if (failedJonfrey.length === 0) return null
  return (
    <div className="bg-surface border border-danger/30 rounded-md overflow-hidden mb-4">
      <div className="px-4 py-2.5 border-b border-border bg-danger/5">
        <p className="text-xs font-medium text-danger uppercase tracking-wide">
          Ações com falha ({failedJonfrey.length})
        </p>
      </div>
      <div className="divide-y divide-border">
        {failedJonfrey.map(a => (
          <div key={a.id} className="px-4 py-3 hover:bg-surface-2">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-mono text-fg">{a.action_type}</span>
              <Badge variant="danger" size="sm">failed</Badge>
              <span className="text-[10px] text-fg-3">{a.triggered_by}</span>
              <span className="text-[10px] text-fg-3 ml-auto">
                {new Date(a.created_at).toLocaleString('pt-BR')}
              </span>
            </div>
            {a.error_message?.trim() ? (
              <p className="text-xs text-danger font-mono break-words">{a.error_message}</p>
            ) : (
              <p className="text-xs text-fg-3">Sem mensagem de erro detalhada.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface JonfreyTabProps {
  q?: string
  status?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JonfreyTab({ q = '', status = '' }: JonfreyTabProps) {
  const { data: actions = [], isLoading } = useQuery<JonfreyAction[]>({
    queryKey: ['jonfrey-actions'],
    queryFn: () =>
      apiClient
        .get('/api/jonfrey/actions')
        .then(r => r.data ?? [])
        .catch(() => []),
    refetchInterval: 15_000,
  })

  const filtered = React.useMemo(() => {
    let result = actions
    if (status) result = result.filter(a => a.status === status)
    if (q) {
      const lq = q.toLowerCase()
      result = result.filter(a => {
        const outcome = primaryJonfreyOutcome(a)
        return (
          a.action_type.toLowerCase().includes(lq) ||
          outcome.toLowerCase().includes(lq) ||
          (a.target ?? '').toLowerCase().includes(lq) ||
          a.triggered_by.toLowerCase().includes(lq)
        )
      })
    }
    return result
  }, [actions, q, status])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  if (!actions.length) {
    return (
      <EmptyState
        title="Nenhuma ação Jonfrey"
        description="Execute o assistente em Automations > Jonfrey para ver o changelog aqui."
      />
    )
  }

  if (!filtered.length) {
    return (
      <EmptyState
        title="Nenhuma ação encontrada"
        description="Tente ajustar os filtros."
      />
    )
  }

  return (
    <div className="space-y-3">
      <JonfreyFailuresAlert actions={filtered} />
      <p className="text-xs text-fg-3">
        Auditoria do assistente Jonfrey (mesmos registros que em{' '}
        <a href="/automations/jonfrey" className="text-accent hover:underline">
          Automations &rarr; Jonfrey
        </a>
        ).
      </p>
      <div className="space-y-2">
        {filtered.map(a => (
          <JonfreyActionCard key={a.id} action={a} />
        ))}
      </div>
    </div>
  )
}
