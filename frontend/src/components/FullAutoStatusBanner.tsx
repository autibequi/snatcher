import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'

/** Onde o banner aparece — define o texto “o que muda aqui” + links de contexto. */
export type FullAutoBannerPlacement =
  | 'default'
  /** Visão geral / KPI de automações (`/automations`) */
  | 'automations'
  /** Lista de automações por canal (`/automations/channels`) */
  | 'automations_channels'
  /** Página Jonfrey */
  | 'jonfrey'

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
  /** Por defeito: automações = sem toggle Full-auto; resto = com toggle */
  showToggle?: boolean
  /** Conteúdo à direita (ex.: toggle Auto-pilot na página Automações). Quando definido em `automations`, substitui o espaço onde antes só havia texto. */
  trailing?: React.ReactNode
  /**
   * Em viewport &lt; sm: substitui `trailing` por este bloco (ex.só toggles compactos).
   * Sem isto, em mobile esconde-se o texto do banner mas `trailing` grande ainda aparecia — má UX.
   */
  trailingCompact?: React.ReactNode
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
  trailing,
  trailingCompact,
  queueBusy: queueBusyProp,
  className = '',
}: FullAutoStatusBannerProps) {
  const qc = useQueryClient()
  const showToggleResolved = (showToggle ?? placement !== 'automations') && !trailing

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

  const impactLine =
    placement === 'automations' ? (
      <span>
        <strong className="text-fg-2">Nesta página:</strong> controla se disparos gerados pelo auto-match (piloto) podem{' '}
        <strong className="text-fg-2">sair da fila de aprovação</strong> automaticamente. Útil para não clicar &quot;Aprovar&quot; em cada oferta.
      </span>
    ) : placement === 'automations_channels' ? (
      <span>
        <strong className="text-fg-2">Nesta página:</strong> você ajusta <strong className="text-fg-2">cada canal</strong>. O Full-auto é{' '}
        <strong className="text-fg-2">global</strong>: quando ligado, qualquer dispatch criado pelo auto-match em qualquer canal pode ser liberado sem revisão
        (desde que o piloto e as regras do canal permitam).
      </span>
    ) : placement === 'jonfrey' ? (
      <span>
        <strong className="text-fg-2">Aqui:</strong> o Full-auto combina com as ações do Jonfrey — ao ligar, ajuda a liberar o fluxo de dispatches pendentes
        conforme a action <strong className="text-fg-2">auto_release_pending</strong>.
      </span>
    ) : (
      <span>
        Afeta <strong className="text-fg-2">disparos automáticos</strong> (auto-match / piloto): com Full-auto ligado, eles podem ir direto para envio sem passar
        pela caixa de aprovação manual.
      </span>
    )

  const syncLine =
    placement === 'automations' ? (
      trailing ? (
        <span>
          À direita: <strong className="text-fg-2">Auto-pilot</strong> (match + ciclo Jonfrey). Intervalo e ações em{' '}
          <Link to="/automations/jonfrey" className="text-accent hover:underline font-medium">
            Jonfrey
          </Link>
          .
        </span>
      ) : (
        <span>
          O mesmo estado acompanha o cartão <strong className="text-fg-2">Auto-pilot</strong> abaixo. Piloto e lista de ações em{' '}
          <Link to="/automations/jonfrey" className="text-accent hover:underline font-medium">
            Jonfrey
          </Link>
          .
        </span>
      )
    ) : placement === 'automations_channels' ? (
      <span>
        Auto-match global e Full-auto são os mesmos de{' '}
        <Link to="/automations" className="text-accent hover:underline font-medium">
          Visão geral
        </Link>
        . Por canal: thresholds e grupos na linha da tabela ou no drawer.
      </span>
    ) : placement === 'jonfrey' ? (
      <span>
        Estado alinhado com{' '}
        <Link to="/automations" className="text-accent hover:underline font-medium">
          Automações
        </Link>{' '}
        e com o toggle acima.
      </span>
    ) : (
      <span>
        Sincronizado com{' '}
        <Link to="/automations" className="text-accent hover:underline font-medium">
          Automações
        </Link>{' '}
        e{' '}
        <Link to="/automations/jonfrey" className="text-accent hover:underline font-medium">
          Jonfrey
        </Link>
        .
      </span>
    )

  const mobileSummary = fullAutoMode ? 'Full-auto ligado' : 'Full-auto desligado'

  return (
    <div
      className={`flex flex-row flex-wrap sm:flex-nowrap items-center sm:items-start gap-2 sm:gap-3 border rounded-md p-2 sm:p-4 ${
        fullAutoMode ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'
      } ${className}`}
      title={mobileSummary}
    >
      <span className="hidden sm:inline-block text-base leading-none mt-0.5 shrink-0" aria-hidden>
        {fullAutoMode ? '✅' : '⚠️'}
      </span>
      <div className="hidden sm:block flex-1 min-w-0">
        <p className={`text-sm font-semibold ${fullAutoMode ? 'text-success' : 'text-fg'}`}>
          Full-auto: {fullAutoMode ? 'ATIVO' : 'desligado (modo manual)'}
        </p>
        <p className="text-xs text-fg-3 mt-0.5 leading-relaxed">{impactLine}</p>
        <p className="text-[11px] text-fg-3 mt-1.5 opacity-90">
          Regra técnica: <strong className="text-fg-2">full_auto_mode</strong> destrava a action{' '}
          <strong className="text-fg-2">auto_release_pending</strong> — dispatches pendentes do piloto podem seguir sem clique em &quot;Aprovar&quot;.
        </p>
        <p className="text-xs text-fg-3 mt-1">{syncLine}</p>
      </div>
      {trailing ? (
        <>
          <div
            className={`flex-shrink-0 flex flex-col items-end gap-2 min-w-0 ${trailingCompact ? 'hidden sm:flex' : 'flex'} ${!trailingCompact ? 'max-sm:w-full max-sm:items-stretch' : ''}`}
          >
            {trailing}
          </div>
          {trailingCompact ? (
            <div className="flex sm:hidden flex-shrink-0 items-center justify-end gap-2 ml-auto w-full sm:w-auto">
              {trailingCompact}
            </div>
          ) : null}
        </>
      ) : null}
      {showToggleResolved ? (
        <button
          type="button"
          disabled={toggleMut.isPending || queueBusy}
          title={queueBusy ? 'Aguarde a fila Jonfrey terminar' : mobileSummary}
          aria-label={mobileSummary}
          onClick={() => toggleMut.mutate(!fullAutoMode)}
          className={`relative rounded-full transition-colors flex-shrink-0 mt-0 sm:mt-0.5 w-9 h-5 sm:w-11 sm:h-6 ${
            fullAutoMode ? 'bg-success' : 'bg-border'
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform w-4 h-4 sm:w-5 sm:h-5 ${
              fullAutoMode ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      ) : null}
    </div>
  )
}
