import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import {
  JonfreyActionCard,
  primaryJonfreyOutcome,
  type JonfreyAction,
} from '../../components/JonfreyActionCard'

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
