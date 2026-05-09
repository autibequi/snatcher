import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Skeleton, EmptyState } from '../ui'
import { apiClient } from '../../lib/apiClient'

export type InboxItem = {
  id: string
  severity: 'critico' | 'atencao'
  category: 'wa_disconnect' | 'crawler_fail' | 'curation_pending' | 'group_fail' | string
  title: string
  subtitle: string
  cta: { label: string; href: string }
}


const categoryIcon: Record<string, string> = {
  wa_disconnect: '📵',
  crawler_fail: '🕷️',
  curation_pending: '📦',
  group_fail: '⚠️',
  jonfrey_fail: '🤖',
}

function getIcon(category: string): string {
  return categoryIcon[category] ?? '🔔'
}

interface InboxItemRowProps {
  item: InboxItem
  isLast: boolean
  onDismiss: (id: string) => void
}

function InboxItemRow({ item, isLast, onDismiss }: InboxItemRowProps) {
  const navigate = useNavigate()
  const isCritico = item.severity === 'critico'

  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3.5 ${
        !isLast ? 'border-b border-border' : ''
      }`}
    >
      {/* Ícone */}
      <div
        className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-base ${
          isCritico
            ? 'bg-red-50 dark:bg-red-900/20'
            : 'bg-amber-50 dark:bg-amber-900/20'
        }`}
      >
        {getIcon(item.category)}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-fg truncate">{item.title}</span>
          <Badge variant={isCritico ? 'danger' : 'warning'} size="sm">
            {isCritico ? 'crítico' : 'atenção'}
          </Badge>
        </div>
        <p className="text-xs text-fg-3 truncate">{item.subtitle}</p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => navigate(item.cta.href)}
        className="text-xs text-accent hover:underline whitespace-nowrap flex-shrink-0 border border-border rounded px-2 py-1"
      >
        {item.cta.label} →
      </button>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        title="Dispensar"
        className="text-fg-3 hover:text-fg text-base leading-none flex-shrink-0 px-1"
      >
        ×
      </button>
    </div>
  )
}

interface OperationInboxProps {
  /** IDs já dispensados pela tela pai (opcional — componente gerencia próprio estado interno) */
  externalDismissed?: Set<string>
  onDismiss?: (id: string) => void
}

export function OperationInbox({ externalDismissed, onDismiss }: OperationInboxProps) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())

  const { data: rawItems = [], isLoading } = useQuery<InboxItem[]>({
    queryKey: ['dashboard', 'inbox-v2'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/inbox')
        .then(r => (Array.isArray(r.data) ? (r.data as InboxItem[]) : []))
        .catch(() => []),
    refetchInterval: 30_000,
  })

  const allDismissed = externalDismissed
    ? new Set([...dismissed, ...externalDismissed])
    : dismissed

  const items = rawItems.filter(i => !allDismissed.has(i.id))

  function handleDismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]))
    onDismiss?.(id)
  }

  function handleDismissAll() {
    const allIds = new Set(rawItems.map(i => i.id))
    setDismissed(allIds)
  }

  const borderColor = items.length > 0 ? 'border-t-danger' : 'border-t-success'

  return (
    <div
      className={`bg-surface border border-border rounded-md overflow-hidden border-t-2 ${borderColor} mb-6`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              items.length > 0
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
            }`}
          >
            {items.length > 0 ? items.length : '✓'}
          </div>
          <span className="text-sm font-medium text-fg">Precisa de você</span>
          <span className="text-sm text-fg-3">· inbox da operação</span>
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={handleDismissAll}
            className="text-xs text-accent hover:underline"
          >
            Resolver tudo →
          </button>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8">
          <EmptyState
            title="Nada pendente"
            description="Operação rodando normalmente."
          />
        </div>
      ) : (
        <div className="max-h-[min(60vh,24rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
          {items.map((item, idx) => (
            <InboxItemRow
              key={item.id}
              item={item}
              isLast={idx === items.length - 1}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  )
}
