import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Switch, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionTitle, sectionSubtitle, switchRow } from '../../lib/uiTokens'
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
}

interface LoopStatus {
  loop_name: string
  status: 'active' | 'suggesting' | 'disabled'
  strikes_30d: number
  actions_last_7d: number
  suggestions_open: number
}

const CATEGORY_LABEL: Record<string, string> = {
  curation:     'Curadoria',
  health:       'Saúde',
  cleanup:      'Limpeza',
  optimization: 'Otimização',
  dispatch:     'Disparo',
  scheduled:    'Agendado',
}

const LOOP_NAMES = [
  'taxonomy_grow', 'scraper_fix', 'template_ab', 'anomaly_pause',
  'affinity_adjust', 'cooldown_suggest', 'cap_suggest', 'auto_tuning', 'content_optimize',
]

const LOOP_CATEGORY: Record<string, string> = {
  taxonomy_grow:    'curation',
  scraper_fix:      'health',
  template_ab:      'optimization',
  anomaly_pause:    'health',
  affinity_adjust:  'optimization',
  cooldown_suggest: 'optimization',
  cap_suggest:      'optimization',
  auto_tuning:      'optimization',
  content_optimize: 'optimization',
}

const LOOP_SCHEDULE: Record<string, string> = {
  taxonomy_grow:    'dom 03h',
  scraper_fix:      'diário 04h',
  template_ab:      'sáb 03h',
  anomaly_pause:    'a cada 15min',
  affinity_adjust:  'mensal dia 1',
  cooldown_suggest: 'mensal dia 5',
  cap_suggest:      'mensal dia 5',
  auto_tuning:      'mensal dia 1',
  content_optimize: 'ter 04h',
}

export function LoopsTab() {
  const qc = useQueryClient()

  const { data: config } = useQuery<JonfreyConfig | null>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
  })

  const { data: available = [], isLoading: loadingAvailable } = useQuery<AvailableAction[]>({
    queryKey: ['jonfrey-available'],
    queryFn: () => apiClient.get('/api/jonfrey/available').then(r => r.data ?? []).catch(() => []),
    staleTime: 5 * 60_000,
  })

  const { data: jonfreyActions = [] } = useQuery<JonfreyAction[]>({
    queryKey: ['jonfrey-actions'],
    queryFn: () => apiClient.get('/api/jonfrey/actions').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 15_000,
  })

  const { data: loopStatuses = [], isLoading: loadingLoops } = useQuery<LoopStatus[]>({
    queryKey: ['loops-status'],
    queryFn: () => apiClient.get('/api/admin/loops/status').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 30_000,
  })

  const pilotMut = useMutation({
    mutationFn: (enabled: boolean) => apiClient.put('/api/jonfrey/config', { enabled }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
  })

  const actionMut = useMutation({
    mutationFn: ({ actionId, enable }: { actionId: string; enable: boolean }) => {
      const current = config?.enabled_actions ?? []
      const next = enable ? Array.from(new Set([...current, actionId])) : current.filter(a => a !== actionId)
      return apiClient.put('/api/jonfrey/config', { enabled_actions: next }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
  })

  const [running, setRunning] = React.useState<Record<string, boolean>>({})

  const runJonfrey = async (actionType: string) => {
    setRunning(r => ({ ...r, [actionType]: true }))
    await apiClient.post('/api/jonfrey/run', { action_type: actionType }).catch(() => null)
    setTimeout(() => {
      setRunning(r => ({ ...r, [actionType]: false }))
      qc.invalidateQueries({ queryKey: ['jonfrey-actions'] })
    }, 3000)
  }

  const runLoop = async (loopName: string) => {
    setRunning(r => ({ ...r, [loopName]: true }))
    await apiClient.post(`/api/admin/loops/${loopName}/run`).catch(() => null)
    setTimeout(() => {
      setRunning(r => ({ ...r, [loopName]: false }))
      qc.invalidateQueries({ queryKey: ['loops-status'] })
    }, 3000)
  }

  const setLoopStatus = async (loopName: string, status: string) => {
    await apiClient.post(`/api/admin/loops/${loopName}/status`, { status }).catch(() => null)
    qc.invalidateQueries({ queryKey: ['loops-status'] })
  }

  const enabledActions = config?.enabled_actions ?? []
  const loopMap = Object.fromEntries(loopStatuses.map(l => [l.loop_name, l]))
  const lastByType = (type: string) => jonfreyActions.find(a => a.action_type === type)

  const isLoading = loadingAvailable || loadingLoops

  return (
    <div className="space-y-6">
      {/* Auto-pilot global */}
      <div className={sectionCard}>
        <div className={switchRow}>
          <div>
            <p className={sectionTitle}>Automações — Jonfrey</p>
            <p className={`${sectionSubtitle} mt-0.5`}>
              Quando ligado, o Jonfrey roda as ações habilitadas a cada {config?.interval_minutes ?? 60} min.
            </p>
            {config?.last_run_at && (
              <p className="text-[11px] text-fg-3 mt-1">Último ciclo: {relJonfreyTime(config.last_run_at)}</p>
            )}
          </div>
          <Switch checked={!!config?.enabled} disabled={pilotMut.isPending} onChange={v => pilotMut.mutate(v)} />
        </div>
      </div>

      {/* Tabela unificada */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-surface-2 text-[11px] font-medium text-fg-3 uppercase tracking-wide">
            <span>Automação</span>
            <span className="text-right">Tipo</span>
            <span className="text-right">Última execução</span>
            <span className="text-right">Estado</span>
            <span className="text-right">Run</span>
          </div>

          {/* Jonfrey actions */}
          {available.map(action => {
            const last = lastByType(action.type)
            const enabled = enabledActions.includes(action.type)
            return (
              <div key={action.type} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center bg-surface hover:bg-surface-2/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate" title={action.description}>
                    {action.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <p className="text-[11px] text-fg-3 truncate">{action.description.slice(0, 80)}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Jonfrey</span>
                  <span className="text-[10px] text-fg-3">{CATEGORY_LABEL[action.category] ?? action.category}</span>
                </div>
                <div className="text-right shrink-0">
                  {last ? (
                    <span className="text-[11px] text-fg-3">{relJonfreyTime(last.created_at)}</span>
                  ) : (
                    <span className="text-[11px] text-fg-4">nunca</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <Switch size="sm" checked={enabled} disabled={actionMut.isPending} onChange={v => actionMut.mutate({ actionId: action.type, enable: v })} />
                  <span className="text-[10px] text-fg-3">{enabled ? 'ativa' : 'inativa'}</span>
                </div>
                <div className="shrink-0">
                  <button
                    onClick={() => runJonfrey(action.type)}
                    disabled={running[action.type]}
                    className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
                  >
                    {running[action.type] ? '⏳' : '▶'}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Loops autônomos */}
          {LOOP_NAMES.map(name => {
            const loop = loopMap[name] ?? { loop_name: name, status: 'disabled', strikes_30d: 0, actions_last_7d: 0, suggestions_open: 0 }
            const statusColor = loop.status === 'active' ? 'text-success' : loop.status === 'suggesting' ? 'text-warning' : 'text-fg-3'
            return (
              <div key={name} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center bg-surface hover:bg-surface-2/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <p className="text-[11px] text-fg-3">{LOOP_SCHEDULE[name]} · {loop.actions_last_7d} ações/7d</p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-3 font-medium">Loop</span>
                  <span className="text-[10px] text-fg-3">{CATEGORY_LABEL[LOOP_CATEGORY[name]] ?? 'Agendado'}</span>
                </div>
                <div className="text-right shrink-0">
                  {loop.strikes_30d > 0 && (
                    <span className="text-[11px] text-danger">{loop.strikes_30d} strikes</span>
                  )}
                </div>
                <div className="shrink-0">
                  <select
                    value={loop.status}
                    onChange={e => setLoopStatus(name, e.target.value)}
                    className={`text-xs rounded border border-border bg-surface px-1 py-0.5 ${statusColor} cursor-pointer`}
                  >
                    <option value="active">Ativo</option>
                    <option value="suggesting">Sugestão</option>
                    <option value="disabled">Inativo</option>
                  </select>
                </div>
                <div className="shrink-0">
                  <button
                    onClick={() => runLoop(name)}
                    disabled={running[name]}
                    className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
                  >
                    {running[name] ? '⏳' : '▶'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
