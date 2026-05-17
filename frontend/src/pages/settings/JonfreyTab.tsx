import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Skeleton, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { useWSEvent } from '../../lib/useWS'
import {
  sectionCard,
  sectionTitle,
  sectionSubtitle,
  switchRow,
  formLabel,
  formHint,
  statusChipSuccess,
  statusChipDanger,
  statusChipMuted,
} from '../../lib/uiTokens'
import {
  JonfreyActionCard,
  relJonfreyTime,
  type JonfreyAction,
} from '../../components/JonfreyActionCard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JonfreyConfig {
  enabled: boolean
  interval_minutes?: number
  enabled_actions?: string[]
  last_run_at?: string | null
  threshold?: number | null
  provider?: string | null
}

// Automation representa o formato retornado pelo backend (GET /api/admin/automations).
interface Automation {
  id: string
  kind: 'critical' | 'elective'
  enabled: boolean
  cron_expr?: string
  interval_minutes?: number
  controlled_by_jonfrey: boolean
  last_run_at?: string
  last_status?: string
}

// loadAutomationsForJonfrey busca a lista de automações do backend para o JonfreyTab.
async function loadAutomationsForJonfrey(): Promise<Automation[]> {
  const response = await apiClient.get<Automation[]>('/api/admin/automations')
  return response.data
}

// ── Status chip helper ────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  if (status === 'success') return <span className={statusChipSuccess}>sucesso</span>
  if (status === 'failed') return <span className={statusChipDanger}>falhou</span>
  if (status === 'running') return <span className={`${statusChipMuted} animate-pulse`}>rodando</span>
  return <span className={statusChipMuted}>{status}</span>
}

// ── AutomationRow ─────────────────────────────────────────────────────────────

// AutomationRow renderiza uma linha de automação DB-driven com toggle de enable/disable.
// Exibe o ID da automação como label quando nenhum label descritivo está disponível.
function AutomationRow({
  automation,
  lastAction,
  pilotOn,
  onToggle,
  isPending,
}: {
  automation: Automation
  lastAction?: JonfreyAction
  pilotOn: boolean
  onToggle: (v: boolean) => void
  isPending: boolean
}) {
  const isCritical = automation.kind === 'critical'

  return (
    <div className={sectionCard}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <p className={`${formLabel}`}>{automation.id}</p>
          <p className={formHint}>
            {isCritical ? 'Automacao critica — nao pode ser desativada.' : `Tipo: ${automation.kind}`}
            {automation.interval_minutes ? ` · Cadencia: ${automation.interval_minutes} min` : ''}
            {automation.controlled_by_jonfrey ? ' · Controlada pelo Jonfrey' : ''}
          </p>

          {/* Last run */}
          {lastAction ? (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <StatusChip status={lastAction.status} />
              <span className="text-[11px] text-fg-3">
                {relJonfreyTime(lastAction.created_at)}
              </span>
              {lastAction.reasoning?.trim() && (
                <span className="text-[11px] text-fg-2 truncate max-w-xs" title={lastAction.reasoning}>
                  {lastAction.reasoning.slice(0, 80)}{lastAction.reasoning.length > 80 ? '…' : ''}
                </span>
              )}
              {lastAction.error_message?.trim() && (
                <span className="text-[11px] text-danger truncate max-w-xs" title={lastAction.error_message}>
                  {lastAction.error_message.slice(0, 80)}{lastAction.error_message.length > 80 ? '…' : ''}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-fg-3 pt-1">Nenhuma execucao registrada</p>
          )}

          {!pilotOn && automation.enabled && (
            <p className="text-[11px] text-warning pt-0.5">
              Auto-pilot desligado — esta automacao nao vai rodar ate ser ativado abaixo.
            </p>
          )}
          {isCritical && (
            <p className="text-[11px] text-danger pt-0.5">
              Automacao critica — desativar nao e permitido.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Switch
            checked={automation.enabled}
            disabled={isPending || isCritical}
            onChange={onToggle}
          />
          <span className="text-[10px] text-fg-3">{automation.enabled ? 'ativa' : 'inativa'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function JonfreyTab() {
  const qc = useQueryClient()

  const { data: config, isLoading: configLoading } = useQuery<JonfreyConfig | null>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
  })

  const { data: actions = [], isLoading: actionsLoading } = useQuery<JonfreyAction[]>({
    queryKey: ['jonfrey-actions'],
    queryFn: () =>
      apiClient.get('/api/jonfrey/actions').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 15_000,
  })

  // automations busca a lista de automacoes do DB via /api/admin/automations.
  // Substitui o array KNOWN_AUTOMATIONS hardcoded com os 8 registros reais do banco.
  const { data: automations = [], refetch: refetchAutomations } = useQuery<Automation[]>({
    queryKey: ['automations'],
    queryFn: loadAutomationsForJonfrey,
    refetchInterval: 30_000,
  })

  // Hot-reload WS: invalida o cache de automacoes quando o backend notifica mudanca.
  useWSEvent('automation_changed', () => { void refetchAutomations() })

  const pilotMut = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.put('/api/jonfrey/config', { enabled }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao salvar configuracao')
    },
  })

  const actionMut = useMutation({
    mutationFn: ({ actionId, enable }: { actionId: string; enable: boolean }) => {
      if (!config) return Promise.reject(new Error('config nao carregada'))
      const current = config.enabled_actions ?? []
      const next = enable
        ? Array.from(new Set([...current, actionId]))
        : current.filter(a => a !== actionId)
      return apiClient.put('/api/jonfrey/config', { enabled_actions: next }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao atualizar automacao')
    },
  })

  const runNowMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/jonfrey/run').then(r => r.data).catch(() => null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jonfrey-actions'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao acionar Jonfrey')
    },
  })

  /** Reclassifica todo o catálogo com brand_keywords + category_keywords (sem LLM). Pode demorar em bases grandes. */
  const reprocessHeuristicMut = useMutation({
    mutationFn: () =>
      apiClient
        .post<{
          updated_rows?: number
          llm_queue_pending?: number
          llm_queue_processing?: number
          llm_queue_error?: number
        }>('/api/admin/catalog-canonical/reprocess-heuristic', undefined, { timeout: 120_000 })
        .then(r => r.data),
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: unknown }; message?: string }
      const d = ax.response?.data
      const msg =
        typeof d === 'string'
          ? d
          : (d as { error?: string } | undefined)?.error ?? ax.message ?? 'Erro ao reprocessar eurística'
      alert(msg)
    },
  })

  const pilotOn = !!config?.enabled
  const isLoading = configLoading && !config

  // Last action per automation type
  const lastByType = (type: string): JonfreyAction | undefined =>
    actions.find(a => a.action_type === type)

  // Recent actions (last 10 for audit section)
  const recentActions = actions.slice(0, 10)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Auto-pilot global ── */}
      <div className={sectionCard}>
        <div className={switchRow}>
          <div>
            <p className={sectionTitle}>Auto-pilot Jonfrey</p>
            <p className={`${sectionSubtitle} mt-0.5`}>
              Quando ligado, o assistente roda em ciclos periodicos e executa as automacoes ativas abaixo.
            </p>
            {config?.last_run_at && (
              <p className="text-[11px] text-fg-3 mt-1">
                Ultimo ciclo: {relJonfreyTime(config.last_run_at)}
                {config.interval_minutes && ` · cadencia ~${config.interval_minutes} min`}
              </p>
            )}
            {!config?.last_run_at && pilotOn && (
              <p className="text-[11px] text-fg-3 mt-1">Nenhum ciclo registrado ainda.</p>
            )}
          </div>
          <Switch
            checked={pilotOn}
            disabled={pilotMut.isPending || !config}
            onChange={v => pilotMut.mutate(v)}
          />
        </div>

        <div className="border-t border-border pt-3 mt-1 flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            loading={runNowMut.isPending}
            disabled={!config}
            onClick={() => runNowMut.mutate()}
          >
            Rodar agora
          </Button>
          {runNowMut.isSuccess && (
            <p className="text-xs text-success">Ciclo acionado.</p>
          )}
          {runNowMut.isError && (
            <p className="text-xs text-danger">Erro ao acionar.</p>
          )}
          <p className="text-xs text-fg-3">
            Dispara um ciclo imediato independente do agendamento.
          </p>
        </div>
      </div>

      {/* ── Catálogo canónico (eurística) ── */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Catálogo canónico — eurística</p>
        <p className={`${sectionSubtitle} mt-0.5`}>
          Reclassifica marca e categoria de todo o catálogo usando apenas keywords (sem LLM). Atualiza também a fila LLM.
          Catálogo e métricas em{' '}
          <a href="/admin/catalog-canonical" className="text-accent hover:underline">
            /admin/catalog-canonical
          </a>
          .
        </p>
        <div className="border-t border-border pt-3 mt-3 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            loading={reprocessHeuristicMut.isPending}
            onClick={() => reprocessHeuristicMut.mutate()}
          >
            Reprocessar (eurística)
          </Button>
          {reprocessHeuristicMut.isSuccess && reprocessHeuristicMut.data != null && (
            <p className="text-xs text-success">
              Concluído — tocadas: <strong>{reprocessHeuristicMut.data.updated_rows ?? '—'}</strong>
              {' · '}pending: <strong>{reprocessHeuristicMut.data.llm_queue_pending ?? '—'}</strong>
              {' · '}processing: <strong>{reprocessHeuristicMut.data.llm_queue_processing ?? '—'}</strong>
              {' · '}erro: <strong>{reprocessHeuristicMut.data.llm_queue_error ?? '—'}</strong>
            </p>
          )}
          {reprocessHeuristicMut.isError && (
            <p className="text-xs text-danger">Falhou — ver alerta.</p>
          )}
        </div>
      </div>

      {/* ── Automacoes (DB-driven — busca /api/admin/automations) ── */}
      <div>
        <p className={`${sectionTitle} mb-3`}>Automacoes</p>
        <div className="space-y-3">
          {automations.map(automation => (
            <AutomationRow
              key={automation.id}
              automation={automation}
              lastAction={lastByType(automation.id)}
              pilotOn={pilotOn}
              onToggle={v => actionMut.mutate({ actionId: automation.id, enable: v })}
              isPending={actionMut.isPending}
            />
          ))}
        </div>
      </div>

      {/* ── Historico recente ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className={sectionTitle}>Historico recente</p>
          <a
            href="/activity?tab=jonfrey"
            className="text-xs text-accent hover:underline"
          >
            Ver tudo em Activity
          </a>
        </div>

        {actionsLoading && !actions.length ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : recentActions.length === 0 ? (
          <div className={`${sectionCard} text-center py-6`}>
            <p className="text-sm text-fg-3">Nenhuma acao registrada ainda.</p>
            <p className="text-xs text-fg-3 mt-1">
              Ligue o auto-pilot ou clique em "Rodar agora" para ver o historico aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActions.map(a => (
              <JonfreyActionCard key={a.id} action={a} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
