import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Skeleton, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
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

// ── Known automations registry ────────────────────────────────────────────────

interface AutomationMeta {
  id: string
  label: string
  description: string
}

const KNOWN_AUTOMATIONS: AutomationMeta[] = [
  {
    id: 'auto_curate_high_confidence',
    label: 'Auto-triagem de produtos',
    description:
      'Classifica produtos pendentes com categoria e marca quando a confianca do modelo e alta. Sem necessidade de aprovacao manual.',
  },
  {
    id: 'auto_match_promotions',
    label: 'Auto-match de promocoes',
    description:
      'Associa automaticamente novos links rastreados a produtos do catalogo com base em similaridade semantica.',
  },
  {
    id: 'auto_tag_clusters',
    label: 'Auto-tagging de clusters',
    description:
      'Atualiza tags de clusters de canais com base nos topicos dominantes das ultimas mensagens analisadas.',
  },
]

// ── Status chip helper ────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  if (status === 'success') return <span className={statusChipSuccess}>sucesso</span>
  if (status === 'failed') return <span className={statusChipDanger}>falhou</span>
  if (status === 'running') return <span className={`${statusChipMuted} animate-pulse`}>rodando</span>
  return <span className={statusChipMuted}>{status}</span>
}

// ── AutomationRow ─────────────────────────────────────────────────────────────

function AutomationRow({
  meta,
  enabled,
  lastAction,
  pilotOn,
  onToggle,
  isPending,
}: {
  meta: AutomationMeta
  enabled: boolean
  lastAction?: JonfreyAction
  pilotOn: boolean
  onToggle: (v: boolean) => void
  isPending: boolean
}) {
  return (
    <div className={sectionCard}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <p className={`${formLabel}`}>{meta.label}</p>
          <p className={formHint}>{meta.description}</p>

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

          {!pilotOn && enabled && (
            <p className="text-[11px] text-warning pt-0.5">
              Auto-pilot desligado — esta automacao nao vai rodar ate ser ativado abaixo.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Switch
            checked={enabled}
            disabled={isPending}
            onChange={onToggle}
          />
          <span className="text-[10px] text-fg-3">{enabled ? 'ativa' : 'inativa'}</span>
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

  const pilotOn = !!config?.enabled
  const enabledActions = config?.enabled_actions ?? []
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

      {/* ── Automacoes ── */}
      <div>
        <p className={`${sectionTitle} mb-3`}>Automacoes</p>
        <div className="space-y-3">
          {KNOWN_AUTOMATIONS.map(meta => (
            <AutomationRow
              key={meta.id}
              meta={meta}
              enabled={enabledActions.includes(meta.id)}
              lastAction={lastByType(meta.id)}
              pilotOn={pilotOn}
              onToggle={v => actionMut.mutate({ actionId: meta.id, enable: v })}
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
