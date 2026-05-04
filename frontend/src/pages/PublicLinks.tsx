import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface PublicLink {
  id: number
  slug: string
  channel_id: number
  redirect_strategy: string
  active: boolean
  clicks_30d: number
}

export default function PublicLinks() {
  const qc = useQueryClient()

  const { data: links = [], isLoading } = useQuery<PublicLink[]>({
    queryKey: ['public-links'],
    queryFn: () => apiClient.get('/api/public-links').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiClient.patch(`/api/public-links/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-links'] }),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Links públicos</h1>
        <Button variant="primary" size="sm">+ Novo link</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !links.length ? (
        <EmptyState title="Nenhum link público" description="Crie links estáveis com fallback automático entre grupos." cta={{ label: 'Criar link', onClick: () => {} }} />
      ) : (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Slug', 'Estratégia', 'Cliques 30d', 'Status', 'Ações'].map(h => (
                  <th key={h} className="text-left p-3 text-fg-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="p-3">
                    <div>
                      <p className="font-medium text-fg">/g/{l.slug}</p>
                      <button
                        className="text-xs text-accent hover:underline"
                        onClick={() => navigator.clipboard?.writeText(`/g/${l.slug}`)}
                      >
                        Copiar
                      </button>
                    </div>
                  </td>
                  <td className="p-3 text-fg-2">{l.redirect_strategy}</td>
                  <td className="p-3 text-fg">{l.clicks_30d}</td>
                  <td className="p-3">
                    <Badge variant={l.active ? 'success' : 'default'}>{l.active ? 'ativo' : 'inativo'}</Badge>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMut.mutate({ id: l.id, active: !l.active })}
                    >
                      {l.active ? 'Pausar' : 'Ativar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
