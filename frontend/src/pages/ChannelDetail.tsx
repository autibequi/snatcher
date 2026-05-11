import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Tabs, Skeleton, Tooltip as UITooltip } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { describeError } from '../lib/errors'
import { OverviewTab } from './channels/OverviewTab'
import { AudienceTab } from './channels/AudienceTab'
import { GroupsTab } from './channels/GroupsTab'
import { HistoryTab } from './channels/HistoryTab'

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'audience', label: 'Audiência' },
  { id: 'groups', label: 'Grupos' },
  { id: 'history', label: 'Histórico' },
]

export interface ChannelDetailInnerProps {
  channelId: string
  embedded?: boolean
  onClose?: () => void
  /** Se true (ex.: drawer em Auto disparos), permite editar limites/filtros aqui. */
  editAutomation?: boolean
}

export function ChannelDetailInner({ channelId, embedded, onClose }: ChannelDetailInnerProps) {
  const id = channelId
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'overview') as string

  const setTab = React.useCallback((newTab: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', newTab)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const qc = useQueryClient()

  const [showSuggest, setShowSuggest] = React.useState(false)
  const [suggestResult, setSuggestResult] = React.useState<any>(null)
  const [suggestLoading, setSuggestLoading] = React.useState(false)

  const runSuggest = async () => {
    setSuggestLoading(true)
    setSuggestResult(null)
    setShowSuggest(true)
    try {
      const r = await apiClient.post('/api/automations/' + String(id) + '/advise', {}, { timeout: 60_000 })
      setSuggestResult(r.data)
    } catch (e: any) {
      setSuggestResult({ error: e?.response?.data?.error ?? e?.message ?? 'Falha ao buscar sugestões' })
    } finally {
      setSuggestLoading(false)
    }
  }

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/channels/${id}`),
    onSuccess: () => {
      onClose?.()
      navigate('/automations/channels')
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao excluir'),
  })

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channels', id],
    queryFn: () => apiClient.get(`/api/channels/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: metrics } = useQuery({
    queryKey: ['channels', id, 'metrics'],
    queryFn: () => apiClient.get(`/api/channels/${id}/metrics?period=30d`).then(r => r.data).catch(() => ({})),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6"><Skeleton className="h-48 w-full" /></div>
  if (!channel) return <div className="p-6 text-fg-2">Canal não encontrado</div>

  return (
    <div className={`flex flex-col h-full min-h-0 ${embedded ? 'min-h-0' : ''}`}>
      {/* PageHeader */}
      <div className={`border-b border-border shrink-0 ${embedded ? 'px-4 py-3' : 'p-6'}`}>
        {!embedded && (
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate('/automations/channels')} className="text-fg-3 hover:text-fg text-sm">
              ← Canais
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {!embedded ? (
            <div>
              <h1 className="text-lg font-semibold text-fg">{channel.name}</h1>
              {channel.description && <p className="text-sm text-fg-2">{channel.description}</p>}
            </div>
          ) : (
            <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-fg">{channel.name}</h2>
                <p className="text-xs text-fg-3 line-clamp-2 mt-0.5">{channel.description || 'Sem descrição'}</p>
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-fg-3 hover:text-fg text-xl leading-none px-2 shrink-0 -mt-0.5"
                  aria-label="Fechar"
                >
                  ×
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={channel.active ? 'success' : 'default'}>{channel.active ? 'ativo' : 'inativo'}</Badge>
            <UITooltip content="Pedir conselho à IA com base nos últimos disparos deste canal — sugere ajustes de threshold, cooldown e horário" side="bottom">
              <Button variant="secondary" size="sm" loading={suggestLoading} onClick={runSuggest}>
                Sugerir
              </Button>
            </UITooltip>
            <Button
              variant="danger"
              size="sm"
              loading={deleteMut.isPending}
              onClick={() => { if (confirm(`Excluir canal "${channel.name}"? Esta ação é irreversível.`)) deleteMut.mutate() }}
            >
              Excluir
            </Button>
          </div>
        </div>

        {/* Painel de sugestões da IA */}
        {showSuggest && (
          <div className={`border-t border-border bg-surface-2 py-3 ${embedded ? 'px-4 mt-3' : 'px-5 mt-4'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-fg">Sugestões de melhoria — IA</p>
              <button type="button" onClick={() => setShowSuggest(false)} className="text-fg-3 hover:text-fg text-xs">× Fechar</button>
            </div>
            {suggestLoading && <p className="text-xs text-fg-3 mt-1">Analisando desempenho do canal…</p>}
            {suggestResult?.error && (
              <p className="text-xs text-danger mt-1">{suggestResult.error}</p>
            )}
            {suggestResult && !suggestResult.error && (
              <div className="mt-2 space-y-2">
                {suggestResult.summary && <p className="text-sm text-fg-2">{suggestResult.summary}</p>}
                {Array.isArray(suggestResult.suggestions) && suggestResult.suggestions.length > 0 ? (
                  suggestResult.suggestions.map((s: any, i: number) => (
                    <div key={i} className="text-xs border border-border rounded-md p-2 bg-surface">
                      <span className="font-mono text-accent">{s.field}</span>{' '}
                      <span className="text-fg-3">atual: </span><span className="font-mono">{s.current}</span>
                      {' → '}
                      <span className="text-fg-3">sugerido: </span><span className="font-mono text-success">{s.recommended}</span>
                      {s.reason && <p className="text-fg-3 mt-0.5">{s.reason}</p>}
                    </div>
                  ))
                ) : (
                  !suggestLoading && <p className="text-xs text-fg-3">Nenhuma sugestão — canal já está bem configurado.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs nav — overflow-x-auto para mobile */}
      <div className="overflow-x-auto shrink-0">
        <Tabs
          tabs={TABS}
          active={tab}
          onChange={setTab}
          className={embedded ? 'px-2' : 'px-6'}
        />
      </div>

      {/* Tab content */}
      <div className={embedded ? 'flex-1 overflow-y-auto min-h-0 p-4' : 'flex-1 overflow-y-auto p-6'}>
        {tab === 'overview' && <OverviewTab channelId={id} channel={channel} metrics={metrics} />}
        {tab === 'audience' && <AudienceTab channelId={id} />}
        {tab === 'groups' && <GroupsTab channelId={id} />}
        {tab === 'history' && <HistoryTab channelId={id} />}
      </div>
    </div>
  )
}

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <div className="p-6 text-fg-2">Canal não encontrado</div>
  return <ChannelDetailInner channelId={id} />
}
