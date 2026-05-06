import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { KpiCard, Skeleton, Tabs, Switch, Badge } from '../components/ui'
import AudienceEditor from '../components/AudienceEditor'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ChannelAutomation {
  id?: number
  channel_id: number
  enabled: boolean
  auto_match_enabled: boolean
  threshold?: number | null
  max_per_run?: number | null
  cooldown_hours: number
  events_enabled: boolean
  notify_new: boolean
  notify_drop: boolean
  notify_lowest: boolean
  drop_threshold: number
  match_type: string
  match_value?: string | null
  max_price?: number | null
  paused_until?: string | null
  created_at?: string
  updated_at?: string
}

export interface ChannelRow {
  channel_id: number
  channel_name: string
  automation: ChannelAutomation | null
}

interface AutoMatchLog {
  id: number
  product_id: number
  channel_id: number
  dispatch_id: number
  score: number
  created_at: string
  product_name?: string
  channel_name?: string
}

interface AutoMatchStatus {
  enabled: boolean
  threshold: number
  max_per_run: number
  logs: AutoMatchLog[]
  last_run_at: string | null
  interval_seconds: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MATCH_TYPES = [
  { value: 'all',      label: 'Todos os produtos' },
  { value: 'category', label: 'Categoria' },
  { value: 'brand',    label: 'Marca' },
  { value: 'keyword',  label: 'Palavra-chave' },
]

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtScore(s: number): string {
  return s.toFixed(0)
}

// Countdown atualiza a cada 1s
function useCountdown(lastRunAt: string | null, intervalSeconds: number): string {
  const [remaining, setRemaining] = React.useState<number | null>(null)

  React.useEffect(() => {
    function tick() {
      if (!lastRunAt) { setRemaining(null); return }
      const next = new Date(lastRunAt).getTime() + intervalSeconds * 1000
      setRemaining(Math.max(0, Math.round((next - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastRunAt, intervalSeconds])

  if (remaining === null) return '—'
  if (remaining <= 0) return 'executando...'
  return `${remaining}s`
}

// ── Toggle inline de master switch ──────────────────────────────────────────

function MasterToggle({ row }: { row: ChannelRow }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (enabled: boolean) => {
      const current = row.automation ?? defaultAutomation(row.channel_id)
      return apiClient.put(`/api/automations/${row.channel_id}`, { ...current, enabled }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  return (
    <Switch
      checked={row.automation?.enabled ?? false}
      disabled={mut.isPending}
      onChange={(v) => mut.mutate(v)}
    />
  )
}

// Default para criação de nova automação
function defaultAutomation(channelId: number): ChannelAutomation {
  return {
    channel_id: channelId,
    enabled: false,
    auto_match_enabled: false,
    threshold: null,
    max_per_run: null,
    cooldown_hours: 6,
    events_enabled: false,
    notify_new: true,
    notify_drop: true,
    notify_lowest: false,
    drop_threshold: 0.1,
    match_type: 'all',
    match_value: null,
    max_price: null,
    paused_until: null,
  }
}

// ── Drawer ───────────────────────────────────────────────────────────────────

const DRAWER_TABS = [
  { id: 'config',  label: 'Configuracao' },
  { id: 'filters', label: 'Filtros' },
  { id: 'notif',   label: 'Notificacoes' },
  { id: 'monitor', label: 'Monitor' },
]

interface DrawerProps {
  row: ChannelRow
  onClose: () => void
}

export function Drawer({ row, onClose }: DrawerProps) {
  const qc = useQueryClient()
  const [drawerTab, setDrawerTab] = React.useState('config')

  // Estado do formulário — inicializa a partir da automação existente ou defaults
  const initial = row.automation ?? defaultAutomation(row.channel_id)
  const [form, setForm] = React.useState<ChannelAutomation>({ ...initial })

  // Sincronizar se row.automation mudar (ex: após save)
  React.useEffect(() => {
    const src = row.automation ?? defaultAutomation(row.channel_id)
    setForm({ ...src })
  }, [row.automation, row.channel_id])

  // Dados de audiência (carregados ao abrir aba Filtros)
  const { data: audience } = useQuery({
    queryKey: ['channels', String(row.channel_id), 'audience'],
    queryFn: () => apiClient.get(`/api/channels/${row.channel_id}/audience`).then(r => r.data).catch(() => ({})),
    enabled: drawerTab === 'filters',
    staleTime: 30_000,
  })

  // Logs do monitor (GET /api/automations/{channelId})
  const { data: detail, isLoading: detailLoading } = useQuery<{ automation: ChannelAutomation; logs: AutoMatchLog[] }>({
    queryKey: ['automations', row.channel_id, 'detail'],
    queryFn: () => apiClient.get(`/api/automations/${row.channel_id}`).then(r => r.data),
    enabled: drawerTab === 'monitor',
    staleTime: 30_000,
  })
  const monitorLogs = detail?.logs ?? []

  // Mutacao de save
  const saveMut = useMutation({
    mutationFn: () => apiClient.put(`/api/automations/${row.channel_id}`, form).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      qc.invalidateQueries({ queryKey: ['automations', row.channel_id, 'detail'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const set = <K extends keyof ChannelAutomation>(key: K, val: ChannelAutomation[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const globalThreshold = 50 // default global quando null
  const globalMaxPerRun = 3

  const needsMatchValue = form.match_type !== 'all'
  const dropPct = Math.round((form.drop_threshold ?? 0.1) * 100)

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Painel lateral */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-surface border-l border-border z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-fg">{row.channel_name}</h2>
            <p className="text-xs text-fg-3 mt-0.5">Configuracao de automacao</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-3 hover:text-fg text-xl leading-none px-2"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Sub-tabs */}
        <Tabs tabs={DRAWER_TABS} active={drawerTab} onChange={setDrawerTab} className="px-5 shrink-0" />

        {/* Conteudo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Configuracao ── */}
          {drawerTab === 'config' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-fg">Canal ativo</p>
                  <p className="text-xs text-fg-3">Habilita toda automacao deste canal</p>
                </div>
                <Switch checked={form.enabled} onChange={v => set('enabled', v)} />
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-fg">Auto Match</p>
                  <p className="text-xs text-fg-3">Dispara automaticamente produtos com score alto</p>
                </div>
                <Switch checked={form.auto_match_enabled} onChange={v => set('auto_match_enabled', v)} />
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-fg">Eventos</p>
                  <p className="text-xs text-fg-3">Notifica por eventos de preco (nova oferta, queda...)</p>
                </div>
                <Switch checked={form.events_enabled} onChange={v => set('events_enabled', v)} />
              </div>

              <div>
                <label className="text-xs text-fg-2 block mb-1">
                  Threshold de score (0–100)
                  <span className="text-fg-3 ml-1">
                    {form.threshold == null ? `(default: ${globalThreshold})` : ''}
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.threshold ?? globalThreshold}
                  onChange={e => set('threshold', Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs text-fg-3 mt-0.5">
                  <span>0</span>
                  <span className="font-semibold text-fg">{form.threshold ?? globalThreshold}</span>
                  <span>100</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-fg-3 hover:text-accent mt-1"
                  onClick={() => set('threshold', null)}
                >
                  Usar default global ({globalThreshold})
                </button>
              </div>

              <div>
                <label className="text-xs text-fg-2 block mb-1">
                  Max disparos por ciclo
                  <span className="text-fg-3 ml-1">
                    {form.max_per_run == null ? `(default: ${globalMaxPerRun})` : ''}
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_per_run ?? ''}
                  placeholder={String(globalMaxPerRun)}
                  onChange={e => set('max_per_run', e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs text-fg-2 block mb-1">Cooldown entre disparos (horas)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={form.cooldown_hours}
                  onChange={e => set('cooldown_hours', Number(e.target.value) || 6)}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs text-fg-2 block mb-1">Pausar ate (opcional)</label>
                <input
                  type="datetime-local"
                  value={form.paused_until ? form.paused_until.slice(0, 16) : ''}
                  onChange={e => set('paused_until', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
                {form.paused_until && (
                  <button
                    type="button"
                    className="text-xs text-fg-3 hover:text-accent mt-1"
                    onClick={() => set('paused_until', null)}
                  >
                    Remover pausa
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Filtros ── */}
          {drawerTab === 'filters' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-fg-2 block mb-1">Tipo de filtro</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                  value={form.match_type}
                  onChange={e => set('match_type', e.target.value)}
                >
                  {MATCH_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {needsMatchValue && (
                <div>
                  <label className="text-xs text-fg-2 block mb-1">
                    Valor ({MATCH_TYPES.find(t => t.value === form.match_type)?.label.toLowerCase() ?? form.match_type})
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: suplementos / growth / whey"
                    value={form.match_value ?? ''}
                    onChange={e => set('match_value', e.target.value || null)}
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-fg-2 block mb-1">Preco maximo (R$, opcional)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="ex: 199.90"
                  value={form.max_price ?? ''}
                  onChange={e => set('max_price', e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-fg-2 font-medium mb-3">Audiencia do canal</p>
                <AudienceEditor channelId={String(row.channel_id)} audience={audience} />
              </div>
            </div>
          )}

          {/* ── Notificacoes ── */}
          {drawerTab === 'notif' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notify_new}
                  onChange={e => set('notify_new', e.target.checked)}
                  className="accent-accent"
                />
                <div>
                  <p className="text-sm text-fg">Produto novo encontrado</p>
                  <p className="text-xs text-fg-3">Notifica quando um produto que atende ao filtro aparece no catalogo</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notify_drop}
                  onChange={e => set('notify_drop', e.target.checked)}
                  className="accent-accent"
                />
                <div>
                  <p className="text-sm text-fg">Queda de preco</p>
                  <p className="text-xs text-fg-3">Notifica quando o preco cair mais que o threshold abaixo</p>
                </div>
              </label>

              <div>
                <label className="text-xs text-fg-2 block mb-1">
                  Threshold de queda (%) — atualmente {dropPct}%
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={dropPct}
                  disabled={!form.notify_drop}
                  onChange={e => set('drop_threshold', Number(e.target.value) / 100)}
                  className="w-full accent-accent disabled:opacity-40"
                />
                <div className="flex justify-between text-xs text-fg-3 mt-0.5">
                  <span>1%</span>
                  <span className="font-semibold text-fg">{dropPct}%</span>
                  <span>50%</span>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notify_lowest}
                  onChange={e => set('notify_lowest', e.target.checked)}
                  className="accent-accent"
                />
                <div>
                  <p className="text-sm text-fg">Menor preco historico</p>
                  <p className="text-xs text-fg-3">Notifica quando atingir o menor preco registrado para o produto</p>
                </div>
              </label>
            </div>
          )}

          {/* ── Monitor ── */}
          {drawerTab === 'monitor' && (
            <div>
              <p className="text-xs text-fg-2 font-medium uppercase tracking-wide mb-3">Ultimos 20 disparos deste canal</p>
              {detailLoading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : monitorLogs.length === 0 ? (
                <p className="text-sm text-fg-3 py-6 text-center">Nenhum disparo automatico registrado para este canal.</p>
              ) : (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-2 border-b border-border">
                        <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Produto</th>
                        <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Score</th>
                        <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Hora</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitorLogs.map(log => (
                        <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                          <td className="px-3 py-2">
                            <p className="text-xs text-fg truncate max-w-[160px]">{log.product_name || `#${log.product_id}`}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-semibold ${log.score >= 70 ? 'text-success' : log.score >= 50 ? 'text-warning' : 'text-fg-2'}`}>
                              {fmtScore(log.score)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-fg-3">{fmtDate(log.created_at)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <a
                              href={`/dispatches/${log.dispatch_id}`}
                              className="text-xs text-accent hover:underline"
                            >
                              ver &rarr;
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — salvar (exceto monitor) */}
        {drawerTab !== 'monitor' && (
          <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-fg-2 hover:text-fg px-3 py-1.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="text-sm bg-accent text-white rounded-md px-4 py-1.5 hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMut.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Aba Visao Geral ──────────────────────────────────────────────────────────

export function TabOverview() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<AutoMatchStatus>({
    queryKey: ['auto-match'],
    queryFn: () => apiClient.get('/api/auto-match').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const toggleMut = useMutation({
    mutationFn: (payload: Partial<{ enabled: boolean; threshold: number; max_per_run: number }>) =>
      apiClient.post('/api/auto-match/toggle', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-match'] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const [localThreshold, setLocalThreshold] = React.useState<number | null>(null)
  const [localMaxPerRun, setLocalMaxPerRun] = React.useState<number | null>(null)

  // Inicializar locais quando data chegar
  React.useEffect(() => {
    if (data) {
      if (localThreshold === null) setLocalThreshold(data.threshold)
      if (localMaxPerRun === null) setLocalMaxPerRun(data.max_per_run)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = data?.enabled ?? false
  const threshold = localThreshold ?? data?.threshold ?? 50
  const maxPerRun = localMaxPerRun ?? data?.max_per_run ?? 3
  const logs = data?.logs ?? []
  const lastRunAt = data?.last_run_at ?? null
  const intervalSeconds = data?.interval_seconds ?? 60

  // Hook deve estar no top level — chamar incondicionalmente
  const countdownValue = useCountdown(lastRunAt, intervalSeconds)

  // Calcular KPIs a partir dos logs
  const now = Date.now()
  const h24ago = now - 24 * 3600 * 1000
  const recentLogs = logs.filter(l => new Date(l.created_at).getTime() > h24ago)
  const dispatches24h = recentLogs.length
  // clicks 24h: sem endpoint, exibimos "—"
  const deliveryRate = dispatches24h > 0 ? '—' : '—'

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Cliques 24h" value="—" subtitle="via analytics" />
          <KpiCard label="Disparos 24h" value={dispatches24h} subtitle="auto match" />
          <KpiCard label="Taxa entrega" value={deliveryRate} subtitle="estimado" />
          <KpiCard
            label="Proxima execucao"
            value={countdownValue}
            subtitle={enabled ? 'auto match ativo' : 'desativado'}
          />
        </div>
      )}

      {/* Kill-switch global */}
      <div className={`rounded-xl border-2 transition-colors p-5 ${enabled ? 'border-accent bg-accent/5' : 'border-border bg-surface'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-fg">{enabled ? 'Auto Match global ativado' : 'Auto Match global desativado'}</p>
            <p className="text-xs text-fg-3 mt-0.5">
              {enabled
                ? `Rodando a cada ${intervalSeconds}s · score min ${threshold} · max ${maxPerRun}/ciclo`
                : 'Ative para disparar automaticamente produtos matchados.'}
            </p>
          </div>
          <button
            type="button"
            disabled={toggleMut.isPending}
            onClick={() => toggleMut.mutate({ enabled: !enabled })}
            className={`relative w-14 h-7 rounded-full transition-colors focus:outline-none overflow-hidden ${enabled ? 'bg-accent' : 'bg-border'} ${toggleMut.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-label={enabled ? 'Desativar auto match global' : 'Ativar auto match global'}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-7' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Defaults globais */}
      <div className="bg-surface border border-border rounded-md p-4 space-y-4">
        <p className="text-sm font-medium text-fg">Parametros globais</p>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs text-fg-2">Score minimo (0–100)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={e => setLocalThreshold(Number(e.target.value))}
              onBlur={() => toggleMut.mutate({ threshold })}
              className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-2">Max. disparos por ciclo</span>
            <input
              type="number"
              min={1}
              max={20}
              value={maxPerRun}
              onChange={e => setLocalMaxPerRun(Number(e.target.value))}
              onBlur={() => toggleMut.mutate({ max_per_run: maxPerRun })}
              className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </label>
        </div>
      </div>

      {/* Tabela ultimos 10 disparos */}
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Ultimos disparos automaticos</p>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ['auto-match'] })}
            className="text-xs text-accent hover:underline"
          >
            atualizar
          </button>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-fg-3">Nenhum disparo automatico registrado ainda.</p>
            <p className="text-xs text-fg-3 mt-1">Ative o Auto Match acima para comecar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Produto</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Canal</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Quando</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 10).map(log => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-fg truncate max-w-[200px]">{log.product_name || `#${log.product_id}`}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-fg">{log.channel_name || `#${log.channel_id}`}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-sm font-semibold ${log.score >= 70 ? 'text-success' : log.score >= 50 ? 'text-warning' : 'text-fg-2'}`}>
                      {fmtScore(log.score)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs text-fg-3">{fmtDate(log.created_at)}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <a href={`/logs?dispatchId=${log.dispatch_id}`} className="text-xs text-accent hover:underline">
                      ver &rarr;
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Aba Por Canal ────────────────────────────────────────────────────────────

export function TabChannels({ onOpenDrawer }: { onOpenDrawer: (row: ChannelRow) => void }) {
  const { data: rows = [], isLoading } = useQuery<ChannelRow[]>({
    queryKey: ['automations'],
    queryFn: () => apiClient.get('/api/automations').then(r => r.data),
    staleTime: 30_000,
  })

  // Calcular runs 24h a partir dos logs do monitor (seria necessário endpoint dedicado)
  // Por ora exibimos "—" para não precisar de N requests adicionais

  if (isLoading) {
    return (
      <div className="p-6 space-y-2">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-sm text-fg-3">Nenhum canal cadastrado.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Canal</th>
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Master</th>
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Auto Match</th>
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Eventos</th>
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Threshold</th>
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Ultima run</th>
            <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium">Runs 24h</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const a = row.automation
            return (
              <tr
                key={row.channel_id}
                className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                onClick={() => onOpenDrawer(row)}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="text-sm font-medium text-fg hover:text-accent text-left"
                    onClick={() => onOpenDrawer(row)}
                  >
                    {row.channel_name}
                  </button>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <MasterToggle row={row} />
                </td>
                <td className="px-4 py-3">
                  <Badge variant={a?.auto_match_enabled ? 'success' : 'default'} size="sm">
                    {a?.auto_match_enabled ? 'on' : 'off'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={a?.events_enabled ? 'success' : 'default'} size="sm">
                    {a?.events_enabled ? 'on' : 'off'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-fg-2">
                  {a?.threshold != null ? a.threshold : <span className="text-fg-3 italic">default</span>}
                </td>
                <td className="px-4 py-3 text-xs text-fg-3">
                  {a?.updated_at ? fmtDate(a.updated_at) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-fg-2">—</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpenDrawer(row) }}
                    className="text-xs text-accent hover:underline"
                  >
                    Configurar &rarr;
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Pagina principal ─────────────────────────────────────────────────────────


export default function Automations() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <h1 className="text-lg font-semibold text-fg">Automações — Visão geral</h1>
        <p className="text-sm text-fg-3 mt-0.5">Configuração global e KPIs de auto-match</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TabOverview />
      </div>
    </div>
  )
}
