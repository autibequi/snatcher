import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Switch, TooltipIcon } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { fmtJonfreyDate, relJonfreyTime } from '../components/JonfreyActionCard'

interface JonfreyConfig {
  enabled: boolean
  interval_minutes: number
  enabled_actions: string[]
  last_run_at?: string | null
}

interface AvailableAction {
  type: string
  description: string
  uses_llm: boolean
  category: string
  /** ISO — última conclusão desta ação (auditoria Jonfrey) */
  last_run_at?: string | null
  /** success | failed | skipped — resultado dessa última execução */
  last_run_status?: string | null
}

function lastRunRelClass(status: string | null | undefined): string {
  if (status === 'success') return 'text-success font-medium'
  if (status === 'failed') return 'text-danger font-medium'
  if (status === 'skipped') return 'text-warning font-medium'
  return 'text-fg-3'
}

/** Ação ligada + auto-pilot ligado, e sem run recente dentro do intervalo → destaque (atraso). */
function isJonfreyActionOverdue(
  actionEnabled: boolean,
  pilotEnabled: boolean,
  lastRunAt: string | null | undefined,
  intervalMinutes: number,
): boolean {
  if (!actionEnabled || !pilotEnabled) return false
  if (!lastRunAt) return true
  const ms = Date.now() - new Date(lastRunAt).getTime()
  return ms > intervalMinutes * 60 * 1000
}

export default function Jonfrey() {
  const qc = useQueryClient()

  const { data: wq } = useQuery({
    queryKey: ['work-queue'],
    queryFn: () => apiClient.get('/api/work-queue').then(r => r.data ?? { items: [] }),
    refetchInterval: 2_500,
  })

  const jonfreyQueueBusy = React.useMemo(() => {
    const items = (wq as { items?: unknown[] } | undefined)?.items ?? []
    return items.some((raw: unknown) => {
      const i = raw as { status?: string; kind?: string; job_kind?: string }
      if (i.status !== 'running') return false
      if (i.kind === 'jonfrey_audit') return true
      if (i.kind === 'job' && String(i.job_kind ?? '').toLowerCase() === 'jonfrey') return true
      return false
    })
  }, [wq])

  const { data: config } = useQuery<JonfreyConfig>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data),
  })

  const { data: available = [] } = useQuery<AvailableAction[]>({
    queryKey: ['jonfrey-available'],
    queryFn: () => apiClient.get('/api/jonfrey/available').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 60_000,
  })

  const runMut = useMutation({
    mutationFn: (actionType?: string) =>
      apiClient
        .post('/api/jonfrey/run', actionType ? { action_type: actionType } : {})
        .then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jonfrey-actions'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-available'] })
      qc.invalidateQueries({ queryKey: ['work-queue'] })
    },
  })

  const runLocked = runMut.isPending || jonfreyQueueBusy

  const updateConfigMut = useMutation({
    mutationFn: (patch: Partial<JonfreyConfig>) =>
      apiClient.put('/api/jonfrey/config', patch).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-available'] })
    },
  })

  const toggleEnabledAction = (type: string) => {
    if (!config) return
    const next = config.enabled_actions.includes(type)
      ? config.enabled_actions.filter(t => t !== type)
      : [...config.enabled_actions, type]
    updateConfigMut.mutate({ enabled_actions: next })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Piloto = toggle principal; Full-auto = libertação de dispatches sem aprovação */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Barra superior: timer + último ciclo + executar — junto do toggle */}
        <div className="relative border-b border-border bg-gradient-to-br from-accent/[0.07] via-surface to-surface px-4 py-4 sm:px-5 sm:py-5">
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-lg font-semibold text-fg tracking-tight">Auto-pilot</p>
                <p className="text-xs text-fg-3 leading-snug max-w-xl">
                  Liga o ciclo agendado do assistente e as ações marcadas na lista abaixo. Sem isto, o Jonfrey não corre em cadência.
                </p>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0 sm:pt-0.5">
                <span className="text-xs text-fg-3 sm:hidden">Ativar</span>
                <Switch
                  checked={config?.enabled ?? false}
                  onChange={v => updateConfigMut.mutate({ enabled: v })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-stretch sm:items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs shadow-sm">
                  <span className="text-fg-2 whitespace-nowrap">Intervalo</span>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={config?.interval_minutes ?? 60}
                    onChange={e => {
                      const n = Number(e.target.value)
                      if (n >= 5) updateConfigMut.mutate({ interval_minutes: n })
                    }}
                    className="w-14 tabular-nums rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-fg outline-none focus:border-accent"
                  />
                  <span className="text-fg-3">min</span>
                </label>
                {config?.last_run_at ? (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border/90 bg-surface-2/90 px-3 py-2 text-xs shadow-sm">
                    <span className="text-fg-3">Último ciclo</span>
                    <span className="font-mono text-fg-2 tabular-nums">{relJonfreyTime(config.last_run_at)}</span>
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded-lg border border-dashed border-border/80 px-3 py-2 text-[11px] text-fg-3">
                    Ainda sem histórico de ciclo
                  </span>
                )}
              </div>
              <Button
                variant="primary"
                size="md"
                loading={runLocked}
                disabled={runLocked}
                onClick={() => runMut.mutate(undefined)}
                className="w-full shadow-md shadow-accent/15 sm:w-auto sm:min-w-[11rem]"
              >
                ▶ Executar agora
              </Button>
            </div>
            <p className="text-[11px] text-fg-3 leading-snug">
              <strong className="text-fg-2">Executar agora</strong> roda todas as ações habilitadas na hora, sem esperar o próximo intervalo.
            </p>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {(() => {
            const renderRow = (a: AvailableAction) => {
              const enabled = config?.enabled_actions.includes(a.type) ?? false
              const intervalMin = config?.interval_minutes ?? 60
              const pilotOn = config?.enabled ?? false
              const overdue = isJonfreyActionOverdue(enabled, pilotOn, a.last_run_at, intervalMin)
              const outcomeHint =
                a.last_run_status === 'success'
                  ? 'Sucesso'
                  : a.last_run_status === 'failed'
                    ? 'Falha'
                    : a.last_run_status === 'skipped'
                      ? 'Ignorada'
                      : a.last_run_status ?? ''
              return (
                <div key={a.type} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-fg">{a.type}</p>
                    <p className="text-xs text-fg-3">{a.description}</p>
                    <p className="text-[10px] mt-0.5 tabular-nums text-fg-3">
                      Última exec.:{' '}
                      {a.last_run_at ? (
                        <span
                          className={lastRunRelClass(a.last_run_status)}
                          title={
                            `${fmtJonfreyDate(a.last_run_at)}${outcomeHint ? ` · ${outcomeHint}` : ''}${
                              overdue ? ' · Acima do intervalo do auto-pilot' : ''
                            }`
                          }
                        >
                          {relJonfreyTime(a.last_run_at)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </p>
                    {a.uses_llm && (
                      <span className="text-[10px] text-warning font-medium flex items-center gap-1">
                        🧠 Usa LLM <TooltipIcon content="Esta ação chama a IA configurada (OpenRouter). Gasta tokens e pode demorar mais. Desabilite se o LLM não estiver configurado ou pra economizar." side="right" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => runMut.mutate(a.type)}
                      disabled={runLocked}
                      title={runLocked ? 'Aguarde a fila Jonfrey terminar' : 'Rodar esta ação agora'}
                      className="text-xs px-2 py-1 rounded border border-border text-accent hover:bg-accent/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {runLocked ? '…' : '▶ Rodar'}
                    </button>
                    <Switch
                      checked={enabled}
                      onChange={() => toggleEnabledAction(a.type)}
                    />
                  </div>
                </div>
              )
            }

            const categoryOrder = ['cleanup', 'curation', 'health', 'optimization', 'dispatch']
            const categoryLabels: Record<string, { emoji: string; label: string }> = {
              cleanup: { emoji: '🧹', label: 'Limpeza' },
              curation: { emoji: '✨', label: 'Curadoria' },
              health: { emoji: '❤️', label: 'Saúde' },
              optimization: { emoji: '🎯', label: 'Otimização' },
              dispatch: { emoji: '🚀', label: 'Disparo' },
            }

            // Group actions by category
            const grouped = categoryOrder.reduce((acc, cat) => {
              const actions = available
                .filter(a => (a.category || 'other') === cat)
                .sort((a, b) => a.type.localeCompare(b.type))
              if (actions.length > 0) {
                acc[cat] = actions
              }
              return acc
            }, {} as Record<string, AvailableAction[]>)

            // Add "other" category if needed (actions without category)
            const other = available.filter(a => !a.category || !categoryOrder.includes(a.category))
            if (other.length > 0) {
              grouped['other'] = other.sort((a, b) => a.type.localeCompare(b.type))
            }

            return (
              <>
                {Object.entries(grouped).map(([cat, actions]) => (
                  <div key={cat}>
                    <p className="text-xs text-fg-2 font-medium mb-2 flex items-center gap-2 uppercase tracking-wider">
                      {cat === 'other' ? '❓ Outras' : `${categoryLabels[cat]?.emoji} ${categoryLabels[cat]?.label}`}
                    </p>
                    <div className="space-y-1.5 divide-y divide-border/40">
                      {actions.map(renderRow)}
                    </div>
                  </div>
                ))}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
