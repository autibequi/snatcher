import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Button, KpiCard, Switch, Tooltip as UITooltip, TooltipIcon, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { usePublicLinkBaseURL } from '../../hooks/useBrand'
import { sectionCard, responsiveKpiGrid } from '../../lib/uiTokens'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface DayPoint { day: string; value: number }
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function emptyLast7Days(): DayPoint[] {
  const today = new Date()
  const out: DayPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({ day: WEEKDAY_LABELS[d.getDay()], value: 0 })
  }
  return out
}

function DisparoChart({ metrics }: { metrics: any }) {
  const { data, hasData } = React.useMemo(() => {
    const series = metrics?.dispatches_7d_series
    if (Array.isArray(series) && series.length > 0) {
      const mapped = (series as { day: string; value: number }[]).map(p => ({ day: p.day, value: p.value }))
      return { data: mapped, hasData: mapped.some(p => p.value > 0) }
    }
    return { data: emptyLast7Days(), hasData: false }
  }, [metrics])

  return (
    <div className="border border-border rounded-md p-4 bg-surface">
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">
        Disparos — últimos 7 dias
      </p>
      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-fg-3, #9ca3af)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-fg-3, #9ca3af)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, fontSize: 12 }}
              cursor={{ fill: 'var(--color-surface-2, #f3f4f6)' }}
            />
            <Bar dataKey="value" name="Disparos" fill="var(--color-accent, #6366f1)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="relative flex items-end gap-2 h-[120px] px-2 pb-4 opacity-40">
          {data.map((p, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full bg-fg-3/20 rounded-t-sm" style={{ height: '4px' }} />
              <span className="text-[10px] text-fg-3">{p.day}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-fg-3 italic">sem disparos no período</span>
          </div>
        </div>
      )}
    </div>
  )
}

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'category', label: 'Categoria' },
  { value: 'brand', label: 'Marca' },
  { value: 'keyword', label: 'Palavra-chave' },
]

interface OverviewTabProps {
  channelId: string
  channel: any
  metrics: any
}

export function OverviewTab({ channelId, channel, metrics }: OverviewTabProps) {
  const id = channelId
  const publicLinkBase = usePublicLinkBaseURL()
  const qc = useQueryClient()
  const [channelDraft, setChannelDraft] = React.useState({
    name: channel?.name ?? '',
    description: channel?.description ?? '',
    active: channel?.active ?? true,
    slug: channel?.slug || slugify(channel?.name || ''),
  })
  const [publicLinkCopied, setPublicLinkCopied] = React.useState(false)

  React.useEffect(() => {
    if (!channel) return
    setChannelDraft({
      name: channel.name ?? '',
      description: channel.description ?? '',
      active: channel.active ?? true,
      slug: channel.slug || slugify(channel.name || ''),
    })
  }, [channel])

  const channelDraftDirty = !!channel && (
    channelDraft.name.trim() !== (channel.name ?? '').trim() ||
    (channelDraft.description ?? '').trim() !== (channel.description ?? '').trim() ||
    channelDraft.active !== !!channel.active ||
    channelDraft.slug !== (channel.slug || slugify(channel.name ?? ''))
  )

  const updateMut = useMutation({
    mutationFn: () =>
      apiClient.put(`/api/channels/${id}`, {
        ...channel,
        name: channelDraft.name.trim(),
        description: channelDraft.description.trim(),
        active: channelDraft.active,
        slug: channelDraft.slug.trim() || slugify(channelDraft.name.trim()),
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', id] })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const { data: automationRow } = useQuery<any>({
    queryKey: ['automations', id],
    queryFn: () => apiClient.get(`/api/automations/${id}`).then(r => r.data?.automation ?? null).catch(() => null),
    enabled: !!id,
  })

  const globalThreshold = 50
  const globalMaxPerRun = 3

  return (
    <div className="space-y-4">
      {/* Dados do canal */}
      <div className="border border-border rounded-lg p-5 space-y-4 max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">Dados do canal</p>
            <p className="text-xs text-fg-3 mt-0.5">
              Nome, descrição, status e URL pública — salve uma vez. Quando um grupo enche, atualize o convite na aba{' '}
              <strong>Grupos</strong>.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={updateMut.isPending}
            disabled={!channelDraft.name.trim() || !channelDraftDirty}
            onClick={() => updateMut.mutate()}
          >
            Salvar alterações
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-fg-2 block mb-1">Nome *</label>
            <input
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              value={channelDraft.name}
              onChange={e => setChannelDraft(d => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-fg-2 block mb-1">Descrição</label>
            <textarea
              rows={3}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent resize-none"
              value={channelDraft.description}
              onChange={e => setChannelDraft(d => ({ ...d, description: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-md border border-border/80 px-3 py-2.5 bg-surface-2/50">
            <div>
              <p className="text-sm font-medium text-fg">Canal ativo</p>
              <p className="text-[10px] text-fg-3">Desliga automações e envios deste canal</p>
            </div>
            <Switch
              checked={channelDraft.active}
              onChange={v => setChannelDraft(d => ({ ...d, active: v }))}
            />
          </div>
        </div>
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Link público</p>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Slug (parte da URL)</label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-3 font-mono shrink-0">
                {publicLinkBase.replace(/^https?:\/\//, '')}/canal/
              </span>
              <input
                value={channelDraft.slug}
                onChange={e => setChannelDraft(d => ({ ...d, slug: slugify(e.target.value) }))}
                placeholder={slugify(channelDraft.name || 'meu-canal')}
                className="flex-1 min-w-[8rem] text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
              />
            </div>
            <p className="text-xs text-fg-3 mt-1">
              Por padrão vem do nome; pode encurtar para um URL mais limpo (salva junto com os dados acima).
            </p>
          </div>
          <div className="border border-border rounded-md p-3 bg-surface-2">
            <p className="text-[10px] text-fg-2 font-medium uppercase tracking-wide mb-2">Preview</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 text-xs font-mono text-accent bg-surface border border-border rounded px-2 py-1.5 truncate">
                {`${publicLinkBase}/canal/${channelDraft.slug || slugify(channelDraft.name || 'canal')}`}
              </code>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  const u = `${publicLinkBase}/canal/${channelDraft.slug || slugify(channelDraft.name || 'canal')}`
                  void navigator.clipboard.writeText(u).then(() => {
                    setPublicLinkCopied(true)
                    setTimeout(() => setPublicLinkCopied(false), 2000)
                  })
                }}
              >
                {publicLinkCopied ? '✓ Copiado' : 'Copiar'}
              </Button>
              <a
                href={`${publicLinkBase}/canal/${channelDraft.slug || slugify(channelDraft.name || 'canal')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline whitespace-nowrap"
              >
                abrir →
              </a>
            </div>
          </div>
          <p className="text-xs text-fg-3">
            Quem abre vê os grupos ativos e escolhe um para entrar. Links de convite por grupo continuam na aba Grupos.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className={responsiveKpiGrid}>
        <KpiCard
          label="Disparos 7D"
          tooltip="Número de mensagens enviadas pelos grupos deste canal nos últimos 7 dias."
          value={metrics?.dispatches_7d ?? metrics?.dispatches_last_7d ?? '—'}
        />
        <KpiCard
          label="CTR"
          tooltip="Click-Through Rate: percentual de pessoas que clicaram no link após receber a mensagem. Calculado sobre os últimos 30 dias."
          value={metrics?.ctr ? `${(metrics.ctr * 100).toFixed(1)}%` : '—'}
        />
        <KpiCard
          label="Produtos"
          tooltip="Quantidade de produtos únicos já disparados para os grupos deste canal."
          value={metrics?.product_count ?? metrics?.products ?? '—'}
        />
        <KpiCard
          label="Cliques estimados"
          tooltip="Total de cliques registrados nos links dos disparos enviados para os grupos deste canal."
          value={
            metrics?.estimated_clicks != null
              ? Number(metrics.estimated_clicks).toLocaleString('pt-BR')
              : '—'
          }
        />
      </div>

      <DisparoChart metrics={metrics} />

      {/* Resumo da automação (read-only) */}
      <div className={`${sectionCard} max-w-3xl space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">Resumo da automação</p>
            <p className="text-xs text-fg-3 mt-1">
              Threshold, limites por ciclo do worker, cooldown, eventos e notificações são configurados na página{' '}
              <strong className="text-fg-2">Auto disparos</strong> (abra um canal pelo drawer ou use o link).
            </p>
          </div>
          <Link
            to="/automations/channels"
            className="shrink-0 text-sm font-medium text-accent hover:underline"
          >
            Ir para Auto disparos →
          </Link>
        </div>

        {!automationRow ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-fg-2 flex items-center gap-1">
              Automação ativa
              <TooltipIcon content="Interruptor principal do canal na lista de Auto disparos." />
            </dt>
            <dd className="text-fg">{automationRow.enabled ? 'Sim' : 'Não'}</dd>

            <dt className="text-fg-2">Auto-match</dt>
            <dd className="text-fg">{automationRow.auto_match_enabled !== false ? 'Ligado' : 'Desligado'}</dd>

            <dt className="text-fg-2 flex items-center gap-1">
              Threshold (0–100)
              <TooltipIcon content="Score mínimo para candidatos a disparo neste canal." />
            </dt>
            <dd className="text-fg">
              {automationRow.threshold != null && automationRow.threshold !== ''
                ? Number(automationRow.threshold)
                : `Default global (${globalThreshold})`}
            </dd>

            <dt className="text-fg-2 flex items-center gap-1">
              Máx. disparos por ciclo do worker
              <TooltipIcon content="Por execução do worker de auto-match neste canal — não é limite por dia civil." />
            </dt>
            <dd className="text-fg">
              {automationRow.max_per_run != null && automationRow.max_per_run !== ''
                ? automationRow.max_per_run
                : `Default global (${globalMaxPerRun})`}
            </dd>

            <dt className="text-fg-2">Cooldown (horas)</dt>
            <dd className="text-fg">{automationRow.cooldown_hours ?? 6}</dd>

            <dt className="text-fg-2">Pausa até</dt>
            <dd className="text-fg">
              {automationRow.paused_until
                ? new Date(automationRow.paused_until).toLocaleString('pt-BR')
                : '—'}
            </dd>

            <dt className="text-fg-2">Notificações</dt>
            <dd className="text-fg text-xs">
              novo: {automationRow.notify_new ? 'sim' : 'não'} · queda: {automationRow.notify_drop ? 'sim' : 'não'} ·
              menor preço: {automationRow.notify_lowest ? 'sim' : 'não'}
              {automationRow.notify_drop && (
                <span className="text-fg-3">
                  {' '}
                  (queda ≥ {Math.round((automationRow.drop_threshold ?? 0.1) * 100)}%)
                </span>
              )}
            </dd>
          </dl>
        )}
      </div>
    </div>
  )
}
