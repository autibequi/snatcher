import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Switch, Tabs, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

interface SearchTerm {
  id: number
  query: string
  sources?: string
  active: boolean
  crawl_interval: number
  last_crawled_at?: string
  result_count: number
}

function MarketplacesTab() {
  const qc = useQueryClient()
  const { data: terms = [], isLoading } = useQuery<SearchTerm[]>({
    queryKey: ['search-terms'],
    queryFn: () => apiClient.get('/api/search-terms').then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiClient.patch(`/api/search-terms/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search-terms'] }),
  })

  const crawlNow = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/search-terms/${id}/crawl`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search-terms'] }),
  })

  // WS: crawler concluiu
  useWSEvent('crawler.run_completed', () => {
    qc.invalidateQueries({ queryKey: ['search-terms'] })
  })

  if (isLoading) return <div className="space-y-2 p-4">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
  if (!terms.length) return (
    <div className="p-4">
      <EmptyState title="Nenhum crawler" description="Crie um crawler de marketplace para começar." />
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {['Ativo', 'Termo', 'Fontes', 'Intervalo', '# Encontrados', 'Último crawl', 'Ações'].map(h => (
              <th key={h} className="text-left p-3 text-fg-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {terms.map(t => (
            <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="p-3">
                <Switch
                  checked={t.active}
                  onChange={active => toggleMut.mutate({ id: t.id, active })}
                />
              </td>
              <td className="p-3 font-medium text-fg">{t.query}</td>
              <td className="p-3 text-fg-2">{t.sources ?? 'all'}</td>
              <td className="p-3 text-fg-2">{t.crawl_interval}min</td>
              <td className="p-3 text-fg">{t.result_count}</td>
              <td className="p-3 text-fg-3 text-xs">
                {t.last_crawled_at ? new Date(t.last_crawled_at).toLocaleString('pt-BR') : '—'}
              </td>
              <td className="p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => crawlNow.mutate(t.id)}
                  loading={crawlNow.isPending}
                >
                  Rodar agora
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SpyTab() {
  const { data: spies = [], isLoading } = useQuery({
    queryKey: ['crawlers', 'group-spy'],
    queryFn: () => apiClient.get('/api/crawlers/group-spy').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  if (isLoading) return <div className="p-4"><Skeleton className="h-24 w-full" /></div>
  if (!spies.length) return (
    <div className="p-4">
      <EmptyState
        title="Nenhum grupo espionado"
        description="Adicione grupos concorrentes para extrair produtos automaticamente."
        cta={{ label: 'Adicionar grupo', onClick: () => {} }}
      />
    </div>
  )

  return (
    <div className="p-4">
      {spies.map((s: any) => (
        <div key={s.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-md mb-2">
          <div>
            <p className="text-sm font-medium text-fg">{s.group_name}</p>
            <p className="text-xs text-fg-3">{s.platform}</p>
          </div>
          <Badge variant={s.active ? 'success' : 'default'}>{s.active ? 'ativo' : 'parado'}</Badge>
        </div>
      ))}
    </div>
  )
}

export default function Crawlers() {
  const [tab, setTab] = React.useState('marketplaces')
  const tabs = [
    { id: 'marketplaces', label: 'Marketplaces' },
    { id: 'spy', label: 'Grupos concorrentes' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-fg">Crawlers</h1>
        {tab === 'marketplaces' && (
          <Button variant="primary" size="sm">+ Novo crawler</Button>
        )}
      </div>
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        {tab === 'marketplaces' ? <MarketplacesTab /> : <SpyTab />}
      </div>
    </div>
  )
}
