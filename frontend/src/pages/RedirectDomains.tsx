import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetchJSON, authFetch } from '../lib/authFetch'
import { pageContainer } from '../lib/uiTokens'
import { PageHeader } from '../components/ui/PageHeader'

interface Domain {
  id: number
  host: string
  enabled: boolean
  quarantine_until?: string
  created_at: string
}

export default function RedirectDomains() {
  const qc = useQueryClient()
  const [newHost, setNewHost] = useState('')

  const { data: domains = [], isLoading } = useQuery<Domain[]>({
    queryKey: ['redirect-domains'],
    queryFn: () => authFetchJSON<Domain[]>('/api/admin/redirect-domains', []),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['redirect-domains'] })

  const addMut = useMutation({
    mutationFn: (host: string) =>
      authFetch('/api/admin/redirect-domains', {
        method: 'POST',
        body: JSON.stringify({ host }),
      }),
    onSuccess: () => { invalidate(); setNewHost('') },
    onError: () => alert('Erro ao adicionar domínio. Já existe?'),
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/admin/redirect-domains/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/admin/redirect-domains/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const handleAdd = () => {
    const host = newHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!host) return
    addMut.mutate(host)
  }

  const enabled = domains.filter(d => d.enabled)

  return (
    <div className={`${pageContainer} space-y-6`}>
      <PageHeader
        title="Domínios de redirecionamento"
        subtitle={
          <>
            Todos apontam para este servidor. Os links gerados rotacionam entre os domínios habilitados.
            {enabled.length > 0 && (
              <span className="ml-1 text-success font-medium">{enabled.length} ativo{enabled.length !== 1 ? 's' : ''}</span>
            )}
          </>
        }
        className="mb-0"
      />

      {/* Add form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newHost}
          onChange={e => setNewHost(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="ex: meudominio.com.br"
          className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-bg focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleAdd}
          disabled={addMut.isPending || !newHost.trim()}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50"
        >
          {addMut.isPending ? 'Adicionando...' : '+ Adicionar'}
        </button>
      </div>

      {isLoading && <p className="text-fg-3 text-sm">Carregando...</p>}

      {/* Domain list */}
      {!isLoading && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {domains.length === 0 && (
            <p className="px-4 py-6 text-center text-fg-3 text-sm">Nenhum domínio cadastrado.</p>
          )}
          {domains.map(d => (
            <div key={d.id} className={`flex items-center gap-3 px-4 py-3 ${d.enabled ? 'bg-surface' : 'bg-surface-2/40'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-sm font-medium ${d.enabled ? 'text-fg' : 'text-fg-3'}`}>
                    {d.host}
                  </span>
                  {d.enabled ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-soft text-success font-medium">ativo</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-3 font-medium">inativo</span>
                  )}
                  {d.quarantine_until && new Date(d.quarantine_until) > new Date() && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning-soft text-warning font-medium">quarentena</span>
                  )}
                </div>
                <p className="text-[10px] text-fg-3 mt-0.5 font-mono">https://{d.host}/r/{'<shortid>'}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleMut.mutate(d.id)}
                  disabled={toggleMut.isPending}
                  className="text-xs text-fg-2 hover:text-fg underline disabled:opacity-50"
                >
                  {d.enabled ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => { if (confirm(`Remover ${d.host}?`)) deleteMut.mutate(d.id) }}
                  disabled={deleteMut.isPending}
                  className="text-xs text-danger hover:underline disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-surface-2 border border-border px-4 py-3 text-xs text-fg-3 space-y-1">
        <p className="font-medium text-fg-2">Como funciona a rotação</p>
        <p>A cada envio automático, o sistema escolhe um domínio habilitado aleatoriamente (com afinidade por modem quando configurada).</p>
        <p>Para o Composer manual, o shortener usa o domínio padrão configurado em Configurações → Sistema.</p>
        <p>Todos os domínios precisam apontar o DNS para este servidor via A record ou proxy Cloudflare.</p>
      </div>
    </div>
  )
}
