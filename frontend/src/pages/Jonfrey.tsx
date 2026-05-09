import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Switch, TooltipIcon } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface JonfreyAction {
  id: number
  action_type: string
  target?: string | null
  status: string
  reasoning?: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  error_message?: string | null
  triggered_by: string
  created_at: string
  finished_at?: string | null
}

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
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-fg-3/10 text-fg-3 border-fg-3/30',
  running: 'bg-accent/10 text-accent border-accent/30',
  success: 'bg-success/10 text-success border-success/30',
  failed:  'bg-danger/10 text-danger border-danger/30',
  skipped: 'bg-warning/10 text-warning border-warning/30',
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function primaryOutcome(action: JonfreyAction): string {
  const err = action.error_message?.trim()
  if (err) return err
  const r = action.reasoning?.trim()
  if (r) return r
  if (action.status === 'running') return 'Em execução…'
  return '—'
}

function relTime(s: string): string {
  const ms = Date.now() - new Date(s).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

function ActionCard({ action }: { action: JonfreyAction }) {
  const [open, setOpen] = React.useState(false)
  const statusCls = STATUS_COLORS[action.status] ?? STATUS_COLORS.pending
  const outcome = primaryOutcome(action)

  return (
    <div className="border border-border rounded-md bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-surface-2 transition-colors"
      >
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide flex-shrink-0 ${statusCls}`}>
          {action.status}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-fg font-mono">{action.action_type}</p>
            {action.target && (
              <span className="text-[10px] text-fg-3 font-mono">target={action.target}</span>
            )}
            <span className="text-[10px] text-fg-3 ml-auto">{action.triggered_by}</span>
          </div>
          <p className="text-sm text-fg-2 mt-1 leading-snug line-clamp-4">{outcome}</p>
          <p className="text-[10px] text-fg-3 mt-0.5">
            {fmtDate(action.created_at)} · {relTime(action.created_at)}
          </p>
        </div>
        <span className="text-fg-3 flex-shrink-0">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface-2 p-3 space-y-2">
          {action.reasoning?.trim() && (
            <div>
              <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Texto completo</p>
              <p className="text-sm text-fg-2 whitespace-pre-wrap">{action.reasoning}</p>
            </div>
          )}
          {action.error_message?.trim() && (
            <div className="bg-danger/5 border border-danger/30 rounded p-2">
              <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Erro</p>
              <p className="text-xs text-danger font-mono whitespace-pre-wrap break-words">{action.error_message}</p>
            </div>
          )}
          <details className="rounded border border-border bg-surface p-2">
            <summary className="cursor-pointer text-[10px] text-fg-3 uppercase tracking-wide select-none">
              Snapshots técnicos (antes / depois)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Antes</p>
                <pre className="text-[10px] bg-surface border border-border rounded p-2 overflow-x-auto font-mono text-fg-2 max-h-48 overflow-y-auto">
                  {JSON.stringify(action.before ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-[10px] text-fg-3 uppercase tracking-wide mb-1">Depois</p>
                <pre className="text-[10px] bg-surface border border-border rounded p-2 overflow-x-auto font-mono text-fg-2 max-h-48 overflow-y-auto">
                  {JSON.stringify(action.after ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

export default function Jonfrey() {
  const qc = useQueryClient()

  const { data: actions = [], isLoading } = useQuery<JonfreyAction[]>({
    queryKey: ['jonfrey-actions'],
    queryFn: () => apiClient.get('/api/jonfrey/actions').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 10_000,
  })

  const { data: config } = useQuery<JonfreyConfig>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data),
  })

  const { data: available = [] } = useQuery<AvailableAction[]>({
    queryKey: ['jonfrey-available'],
    queryFn: () => apiClient.get('/api/jonfrey/available').then(r => r.data ?? []).catch(() => []),
  })

  const runMut = useMutation({
    mutationFn: (actionType?: string) =>
      apiClient
        .post('/api/jonfrey/run', actionType ? { action_type: actionType } : {})
        .then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-actions'] }),
  })

  const updateConfigMut = useMutation({
    mutationFn: (patch: Partial<JonfreyConfig>) =>
      apiClient.put('/api/jonfrey/config', patch).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
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
      {/* Header */}
      <div>
        <p className="text-sm text-fg-3">
          Jonfrey é um assistente de IA que orquestra automaticamente as outras automações —
          configura crawlers, audita pendências, ajusta thresholds e mantém um changelog de auditoria
          para você entender o que ele fez e por quê.
        </p>
      </div>

      {/* Estado do Full-auto (sincronizado com /automations/pending) */}
      <FullAutoStatusCard />

      {/* Painel de controle */}
      <div className="bg-surface border border-border rounded-md p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-fg">Auto-pilot</p>
            <p className="text-xs text-fg-3">
              Quando ligado, Jonfrey acorda a cada{' '}
              <strong>{config?.interval_minutes ?? 60} min</strong>
              {' '}e executa as ações habilitadas.
              {config?.last_run_at && (
                <span> Último ciclo: {relTime(config.last_run_at)}.</span>
              )}
            </p>
          </div>
          <Switch
            checked={config?.enabled ?? false}
            onChange={v => updateConfigMut.mutate({ enabled: v })}
          />
        </div>

        <div>
          <label className="text-xs text-fg-2 block mb-1">Intervalo (minutos)</label>
          <input
            type="number"
            min={5}
            max={1440}
            value={config?.interval_minutes ?? 60}
            onChange={e => {
              const n = Number(e.target.value)
              if (n >= 5) updateConfigMut.mutate({ interval_minutes: n })
            }}
            className="w-32 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          />
        </div>

        <div className="border-t border-border pt-3 space-y-4">
          {(() => {
            const renderRow = (a: AvailableAction) => {
              const enabled = config?.enabled_actions.includes(a.type) ?? false
              return (
                <div key={a.type} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-fg">{a.type}</p>
                    <p className="text-xs text-fg-3">{a.description}</p>
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
                      disabled={runMut.isPending}
                      className="text-xs px-2 py-1 rounded border border-border text-accent hover:bg-accent/5 disabled:opacity-50"
                    >
                      ▶ Rodar
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

        <div className="border-t border-border pt-3 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-fg-3">
            Executa todas as ações habilitadas agora, sem esperar o próximo ciclo.
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={runMut.isPending}
            onClick={() => runMut.mutate(undefined)}
          >
            ▶ Executar agora
          </Button>
        </div>
      </div>

      {/* Changelog */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-fg">Changelog de auditoria</p>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ['jonfrey-actions'] })}
            className="text-xs text-fg-3 hover:text-fg"
          >
            ↻ Atualizar
          </button>
        </div>
        {isLoading ? (
          <p className="text-xs text-fg-3">Carregando…</p>
        ) : actions.length === 0 ? (
          <div className="bg-surface border border-border rounded-md p-6 text-center">
            <p className="text-sm text-fg-2">Nenhuma ação registrada ainda.</p>
            <p className="text-xs text-fg-3 mt-1">
              Use "Executar agora" ou ligue o auto-pilot para o Jonfrey começar a agir.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map(a => <ActionCard key={a.id} action={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function FullAutoStatusCard() {
  const qc = useQueryClient()
  const { data: appConfig } = useQuery<any>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
    refetchInterval: 30_000,
  })
  const fullAutoMode = !!appConfig?.full_auto_mode
  const toggleMut = useMutation({
    mutationFn: async (v: boolean) => {
      try { await apiClient.put('/api/config', { ...appConfig, full_auto_mode: v }) } catch {}
      if (v) { try { await apiClient.post('/api/jonfrey/run', { action_type: 'enable_full_auto' }) } catch {} }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })

  return (
    <div className={`flex items-start gap-3 border rounded-md p-4 ${fullAutoMode ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}`}>
      <span className="text-base leading-none mt-0.5">{fullAutoMode ? '✅' : '⚠️'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${fullAutoMode ? 'text-success' : 'text-fg'}`}>
          Full-auto: {fullAutoMode ? 'ATIVO' : 'desligado (modo manual)'}
        </p>
        <p className="text-xs text-fg-3 mt-0.5">
          Quando ligado, dispatches criados pelo auto-match são liberados automaticamente pela action <strong>auto_release_pending</strong> sem precisar de aprovação humana.
          Sincronizado com o toggle em <a href="/automations/pending" className="text-accent hover:underline">/automations/pending</a>.
        </p>
      </div>
      <button type="button"
        disabled={toggleMut.isPending}
        onClick={() => toggleMut.mutate(!fullAutoMode)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${fullAutoMode ? 'bg-success' : 'bg-border'} disabled:opacity-50`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fullAutoMode ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}
