import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'

export type FullAutoBannerPlacement = 'jonfrey' | 'automations' | 'default'

function useJonfreyQueueBusy(): boolean {
  const { data: wq } = useQuery({
    queryKey: ['work-queue'],
    queryFn: () => apiClient.get('/api/work-queue').then(r => r.data ?? { items: [] }),
    refetchInterval: 2_500,
  })
  return React.useMemo(() => {
    const items = (wq as { items?: unknown[] } | undefined)?.items ?? []
    return items.some((raw: unknown) => {
      const i = raw as { status?: string; kind?: string; job_kind?: string }
      if (i.status !== 'running') return false
      if (i.kind === 'jonfrey_audit') return true
      if (i.kind === 'job' && String(i.job_kind ?? '').toLowerCase() === 'jonfrey') return true
      return false
    })
  }, [wq])
}

export interface FullAutoStatusBannerProps {
  /** jonfrey: link → Automações | automações: só texto (toggle no KPI) | default: links combinados */
  placement?: FullAutoBannerPlacement
  /** Por defeito: automações = sem toggle; resto = com toggle */
  showToggle?: boolean
  /** Se omitido, calcula-se pela fila de trabalho (Jonfrey em execução) */
  queueBusy?: boolean
  className?: string
}

/**
 * Estado Full-auto (`full_auto_mode`): libera dispatches auto-match via auto_release_pending.
 * Mesmo texto e toggle que em Jonfrey — usar nas telas ligadas ao piloto assistente.
 */
export function FullAutoStatusBanner({
  placement = 'default',
  showToggle,
  queueBusy: queueBusyProp,
  className = '',
}: FullAutoStatusBannerProps) {
  const qc = useQueryClient()
  const showToggleResolved = showToggle ?? placement !== 'automations'

  const internalBusy = useJonfreyQueueBusy()
  const queueBusy = queueBusyProp ?? internalBusy

  const { data: appConfig } = useQuery<Record<string, unknown>>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
    refetchInterval: 30_000,
  })
  const fullAutoMode = !!(appConfig as { full_auto_mode?: boolean } | undefined)?.full_auto_mode

  const toggleMut = useMutation({
    mutationFn: async (v: boolean) => {
      try {
        await apiClient.put('/api/config', { ...appConfig, full_auto_mode: v })
      } catch {
        /* ignore */
      }
      if (v) {
        try {
          await apiClient.post('/api/jonfrey/run', { action_type: 'enable_full_auto' })
        } catch {
          /* ignore */
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
    },
  })

  const syncLine =
    placement === 'automations' ? (
      <span>
        O mesmo estado acompanha o cartão <strong className="text-fg-2">Auto-pilot</strong> abaixo. Piloto, intervalo e ações em{' '}
        <Link to="/automations/jonfrey" className="text-accent hover:underline font-medium">
          Jonfrey
        </Link>
        .
      </span>
    ) : placement === 'jonfrey' ? (
      <span>
        Sincronizado com o Auto-pilot em{' '}
        <Link to="/automations" className="text-accent hover:underline font-medium">
          Automações
        </Link>
        .
      </span>
    ) : (
      <span>
        Sincronizado com o Auto-pilot em{' '}
        <Link to="/automations" className="text-accent hover:underline font-medium">
          Automações
        </Link>{' '}
        e com{' '}
        <Link to="/automations/jonfrey" className="text-accent hover:underline font-medium">
          Jonfrey
        </Link>
        .
      </span>
    )

  return (
    <div
      className={`flex items-start gap-3 border rounded-md p-4 ${
        fullAutoMode ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'
      } ${className}`}
    >
      <span className="text-base leading-none mt-0.5">{fullAutoMode ? '✅' : '⚠️'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${fullAutoMode ? 'text-success' : 'text-fg'}`}>
          Full-auto: {fullAutoMode ? 'ATIVO' : 'desligado (modo manual)'}
        </p>
        <p className="text-xs text-fg-3 mt-0.5">
          Quando ligado, dispatches criados pelo auto-match são liberados automaticamente pela action{' '}
          <strong>auto_release_pending</strong> sem precisar de aprovação humana.
        </p>
        <p className="text-xs text-fg-3 mt-1">{syncLine}</p>
      </div>
      {showToggleResolved ? (
        <button
          type="button"
          disabled={toggleMut.isPending || queueBusy}
          title={queueBusy ? 'Aguarde a fila Jonfrey terminar' : undefined}
          onClick={() => toggleMut.mutate(!fullAutoMode)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
            fullAutoMode ? 'bg-success' : 'bg-border'
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              fullAutoMode ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      ) : null}
    </div>
  )
}
