import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/apiClient'

export interface AutomationDiagnostics {
  flags?: {
    auto_match_enabled?: boolean
    full_auto_mode?: boolean
    auto_match_only_curated?: boolean
  }
  dispatches_by_status?: Record<string, number>
  evolution?: {
    configured?: boolean
    reason_if_not?: string
    active_wa_account_id?: number
  }
  rate_limit_whatsapp?: {
    max_messages_per_group_per_hour?: number
    window_minutes?: number
    groups_most_active_last_hour?: Array<{
      group_id: number
      group_name: string
      delivered_last_60min: number
    }>
  }
  auto_match_channels?: {
    with_auto_match_enabled?: number
    paused_until_future?: number
  }
  backpressure?: {
    max_pending_targets_per_group?: number
    groups_at_or_over_cap?: Array<{
      group_id: number
      group_name: string
      pending_targets: number
    }>
  }
  audience_taxonomy_alignment?: {
    active_channels_with_text_categories_but_no_taxonomy_ids?: number
    sample_channels?: Array<{ channel_id: number; name: string }>
    hint?: string
  }
  jonfrey?: {
    enabled?: boolean
    interval_minutes?: number
    recent_actions?: Array<{ action_type: string; status: string; created_at: string }>
  }
  catalog_quality?: {
    active_products_total?: number
    active_products_inspected?: number
    active_products_inspected_pct?: number
    products_missing_primary_taxonomy?: number
  }
}

function FlagRow({ label, on }: { label: string; on: boolean | undefined }) {
  const ok = on === true
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-fg-2">{label}</span>
      <span className={ok ? 'text-success font-medium' : 'text-warning font-medium'}>{on === true ? 'sim' : 'não'}</span>
    </div>
  )
}

export function AutomationDiagnosticsCard() {
  const { data, isLoading, isError } = useQuery<AutomationDiagnostics>({
    queryKey: ['dashboard', 'automation-diagnostics'],
    queryFn: () => apiClient.get('/api/dashboard/automation-diagnostics').then(r => r.data),
    refetchInterval: 45_000,
  })

  if (isLoading && !data) {
    return (
      <div className="border border-border rounded-lg p-5 bg-surface">
        <p className="text-sm text-fg-3">Carregando diagnóstico de automação…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="border border-border rounded-lg p-5 bg-surface">
        <p className="text-sm text-danger">Não foi possível carregar o diagnóstico.</p>
      </div>
    )
  }

  const flags = data.flags ?? {}
  const disp = data.dispatches_by_status ?? {}
  const evo = data.evolution ?? {}
  const rl = data.rate_limit_whatsapp ?? {}
  const bp = data.backpressure ?? {}
  const aud = data.audience_taxonomy_alignment ?? {}
  const jf = data.jonfrey ?? {}
  const cq = data.catalog_quality ?? {}

  const pendingApproval = disp.pending_approval ?? 0
  const queued = disp.queued ?? 0
  const sending = disp.sending ?? 0

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border bg-surface-2/50">
        <p className="text-sm font-semibold text-fg">Por que não saiu mensagem?</p>
        <p className="text-xs text-fg-3 mt-1">
          Flags globais, fila de dispatches, Evolution (WhatsApp), rate limit e qualidade do catálogo — atualizado a cada ~45s.
        </p>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2 rounded-md border border-border p-3 bg-surface-2/20">
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Flags</p>
          <FlagRow label="Auto-match global" on={flags.auto_match_enabled} />
          <FlagRow label="Full-auto (queued vs aprovação)" on={flags.full_auto_mode} />
          <FlagRow label="Só curated/auto no match" on={flags.auto_match_only_curated} />
        </div>

        <div className="space-y-2 rounded-md border border-border p-3 bg-surface-2/20">
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Dispatches por status</p>
          <div className="text-xs space-y-1">
            <div className="flex justify-between"><span className="text-fg-2">pending_approval</span><span className="font-mono">{pendingApproval}</span></div>
            <div className="flex justify-between"><span className="text-fg-2">queued</span><span className="font-mono">{queued}</span></div>
            <div className="flex justify-between"><span className="text-fg-2">sending</span><span className="font-mono">{sending}</span></div>
            <p className="text-fg-3 pt-1 leading-snug">
              Sem full-auto, novos dispatches ficam em <code className="text-[10px]">pending_approval</code> até aprovação; só <code className="text-[10px]">queued</code> entra no worker Evolution.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3 bg-surface-2/20">
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Evolution (WA)</p>
          <p className={`text-sm font-medium ${evo.configured ? 'text-success' : 'text-danger'}`}>
            {evo.configured ? 'Configurada' : 'Não configurada'}
          </p>
          {!evo.configured && evo.reason_if_not && (
            <p className="text-xs text-fg-3">{evo.reason_if_not}</p>
          )}
          {evo.active_wa_account_id ? (
            <p className="text-[10px] text-fg-3">Conta WA #{evo.active_wa_account_id}</p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border border-border p-3 bg-surface-2/20">
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Rate limit WA</p>
          <p className="text-xs text-fg-2">
            Até {rl.max_messages_per_group_per_hour ?? 3} msg / grupo / {rl.window_minutes ?? 60} min
          </p>
          {(rl.groups_most_active_last_hour?.length ?? 0) > 0 ? (
            <ul className="text-[10px] text-fg-3 space-y-0.5 max-h-24 overflow-y-auto">
              {rl.groups_most_active_last_hour!.slice(0, 6).map(g => (
                <li key={g.group_id} className="truncate" title={g.group_name}>
                  {g.group_name}: {g.delivered_last_60min} entregas (60 min)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-fg-3">Nenhuma entrega recente por grupo nesta janela.</p>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-border p-3 bg-surface-2/20">
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Canais auto-match</p>
          <p className="text-xs">
            Com match ligado: <strong>{data.auto_match_channels?.with_auto_match_enabled ?? 0}</strong>
            {' · '}
            Pausados (paused_until): <strong>{data.auto_match_channels?.paused_until_future ?? 0}</strong>
          </p>
          <p className="text-xs text-fg-3 leading-snug">
            Backpressure: máx. <strong>{bp.max_pending_targets_per_group ?? 10}</strong> targets pendentes/grupo antes de parar novos dispatches.
          </p>
          {(bp.groups_at_or_over_cap?.length ?? 0) > 0 ? (
            <ul className="text-[10px] text-warning space-y-0.5 max-h-20 overflow-y-auto">
              {bp.groups_at_or_over_cap!.map(g => (
                <li key={g.group_id}>{g.group_name}: {g.pending_targets} pendentes</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border border-border p-3 bg-surface-2/20 md:col-span-2 lg:col-span-3">
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Qualidade de dados (Jonfrey / catálogo)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-fg-2 block">Jonfrey</span>
              <span className="font-medium">{jf.enabled ? `ativo (${jf.interval_minutes ?? '—'} min)` : 'off'}</span>
            </div>
            <div>
              <span className="text-fg-2 block">Produtos ativos</span>
              <span className="font-mono">{cq.active_products_total ?? '—'}</span>
            </div>
            <div>
              <span className="text-fg-2 block">Inspecionados</span>
              <span className="font-mono">
                {cq.active_products_inspected_pct != null ? `${cq.active_products_inspected_pct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div>
              <span className="text-fg-2 block">Sem categoria primária</span>
              <span className="font-mono text-warning">{cq.products_missing_primary_taxonomy ?? '—'}</span>
            </div>
          </div>
          {(aud.active_channels_with_text_categories_but_no_taxonomy_ids ?? 0) > 0 && (
            <p className="text-[10px] text-fg-3 mt-2">
              <strong>{aud.active_channels_with_text_categories_but_no_taxonomy_ids}</strong> canal(is) com categorias só em texto, sem IDs de taxonomia.
              {aud.hint ? ` ${aud.hint}` : ''}
            </p>
          )}
          {(jf.recent_actions?.length ?? 0) > 0 && (
            <div className="mt-2 text-[10px] text-fg-3 border-t border-border pt-2">
              Últimas ações Jonfrey:{' '}
              {jf.recent_actions!.slice(0, 4).map(a => `${a.action_type} (${a.status})`).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
