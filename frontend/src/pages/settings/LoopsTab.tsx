import AdminLoops from '../AdminLoops'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Switch, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import {
  sectionCard, sectionTitle, sectionSubtitle,
  switchRow,
  statusChipSuccess, statusChipDanger, statusChipMuted,
} from '../../lib/uiTokens'
import { relJonfreyTime, type JonfreyAction } from '../../components/JonfreyActionCard'

interface JonfreyConfig {
  enabled: boolean
  interval_minutes?: number
  enabled_actions?: string[]
  last_run_at?: string | null
}

interface AvailableAction {
  type: string
  category: string
  description: string
  uses_llm: boolean
  last_run_at?: string
  last_run_status?: string
}

const CATEGORY_LABEL: Record<string, string> = {
  curation:     'Curadoria',
  health:       'Saúde',
  cleanup:      'Limpeza',
  optimization: 'Otimização',
  dispatch:     'Disparo',
}

function StatusChip({ status }: { status: string }) {
  if (status === 'success') return <span className={statusChipSuccess}>sucesso</span>
  if (status === 'failed')  return <span className={statusChipDanger}>falhou</span>
  if (status === 'running') return <span className={`${statusChipMuted} animate-pulse`}>rodando</span>
  return <span className={statusChipMuted}>{status}</span>
}

function JonfreySection() {
  const qc = useQueryClient()

  const { data: config, isLoading } = useQuery<JonfreyConfig | null>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
  })

  const { data: actions = [] } = useQuery<JonfreyAction[]>({
    queryKey: ['jonfrey-actions'],
    queryFn: () => apiClient.get('/api/jonfrey/actions').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 15_000,
  })

  const pilotMut = useMutation({
    mutationFn: (enabled: boolean) => apiClient.put('/api/jonfrey/config', { enabled }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
    onError: (err: unknown) => alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const actionMut = useMutation({
    mutationFn: ({ actionId, enable }: { actionId: string; enable: boolean }) => {
      if (!config) return Promise.reject(new Error('config não carregada'))
      const current = config.enabled_actions ?? []
      const next = enable ? Array.from(new Set([...current, actionId])) : current.filter(a => a !== actionId)
      return apiClient.put('/api/jonfrey/config', { enabled_actions: next }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
  })

  const runNowMut = useMutation({
    mutationFn: () => apiClient.post('/api/jonfrey/run').then(r => r.data).catch(() => null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jonfrey-actions'] }); qc.invalidateQueries({ queryKey: ['jonfrey-config'] }) },
  })

  const { data: available = [] } = useQuery<AvailableAction[]>({
    queryKey: ['jonfrey-available'],
    queryFn: () => apiClient.get('/api/jonfrey/available').then(r => r.data ?? []).catch(() => []),
    staleTime: 5 * 60_000,
  })

  const pilotOn = !!config?.enabled
  const enabledActions = config?.enabled_actions ?? []
  const lastByType = (type: string): JonfreyAction | undefined => actions.find(a => a.action_type === type)

  if (isLoading && !config) {
    return <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
  }

  return (
    <div className="space-y-4">
      {/* Auto-pilot toggle */}
      <div className={sectionCard}>
        <div className={switchRow}>
          <div>
            <p className={sectionTitle}>Jonfrey — Agente automatizador</p>
            <p className={`${sectionSubtitle} mt-0.5`}>
              Quando ligado, roda em ciclos periódicos e executa as automações abaixo.
            </p>
            {config?.last_run_at && (
              <p className="text-[11px] text-fg-3 mt-1">
                Último ciclo: {relJonfreyTime(config.last_run_at)}
                {config.interval_minutes ? ` · cadência ~${config.interval_minutes} min` : ''}
              </p>
            )}
          </div>
          <Switch
            checked={pilotOn}
            disabled={pilotMut.isPending || !config}
            onChange={v => pilotMut.mutate(v)}
          />
        </div>
        <div className="border-t border-border pt-3 mt-1 flex items-center gap-3">
          <Button size="sm" variant="secondary" loading={runNowMut.isPending} disabled={!config} onClick={() => runNowMut.mutate()}>
            Rodar agora
          </Button>
          {runNowMut.isSuccess && <p className="text-xs text-success">Ciclo acionado.</p>}
          <p className="text-xs text-fg-3">Dispara um ciclo imediato independente do agendamento.</p>
        </div>
      </div>

      {/* Automações carregadas dinamicamente do backend */}
      <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
        {available.map(action => {
          const last = lastByType(action.type)
          const enabled = enabledActions.includes(action.type)
          return (
            <div key={action.type} className="bg-surface px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <span
                    className="text-sm font-medium text-fg cursor-help"
                    title={`${action.description}\n(${action.type}${action.uses_llm ? ' · usa LLM' : ''})`}
                  >
                    {action.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span className="ml-1.5 text-[10px] px-1 rounded bg-surface-2 text-fg-3">
                    {CATEGORY_LABEL[action.category] ?? action.category}
                  </span>
                  {action.uses_llm && <span className="ml-1 text-[10px] text-accent">LLM</span>}
                  {last ? (
                    <span className="ml-2 inline-flex items-center gap-1.5">
                      <StatusChip status={last.status} />
                      <span className="text-[11px] text-fg-3">{relJonfreyTime(last.created_at)}</span>
                    </span>
                  ) : (
                    <span className="ml-2 text-[11px] text-fg-3">sem execuções</span>
                  )}
                  {!pilotOn && enabled && (
                    <span className="ml-2 text-[11px] text-warning">auto-pilot off</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Switch checked={enabled} disabled={actionMut.isPending} onChange={v => actionMut.mutate({ actionId: action.type, enable: v })} />
                  <span className="text-[10px] text-fg-3">{enabled ? 'ativa' : 'inativa'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LoopsTab() {
  return (
    <div className="space-y-8">
      <JonfreySection />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-3 mb-3">
          Loops autônomos
        </p>
        <AdminLoops embedded />
      </div>
    </div>
  )
}
