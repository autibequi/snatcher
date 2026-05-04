import React from 'react'
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

function CreateLinkModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    slug: '',
    channel_id: '',
    redirect_strategy: 'first_active',
  })
  const [saving, setSaving] = React.useState(false)

  const { data: channels = [] } = useQuery({
    queryKey: ['channels-select'],
    queryFn: () => apiClient.get('/api/channels').then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.slug.trim() || !form.channel_id) return
    setSaving(true)
    try {
      await apiClient.post('/api/public-links', {
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        channel_id: Number(form.channel_id),
        fallback_chain: [],
        redirect_strategy: form.redirect_strategy,
        active: true,
      })
      qc.invalidateQueries({ queryKey: ['public-links'] })
      onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao criar link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-fg mb-4">Novo link público</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Slug (a-z, números, hífen) *</label>
            <div className="flex items-center border border-border rounded-md overflow-hidden focus-within:border-accent">
              <span className="px-2.5 py-1.5 text-sm text-fg-3 bg-surface-2">/g/</span>
              <input required value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value}))}
                className="flex-1 text-sm px-2 py-1.5 bg-surface text-fg outline-none" placeholder="suplementos" />
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Canal *</label>
            <select required value={form.channel_id} onChange={e => setForm(f => ({...f, channel_id: e.target.value}))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg">
              <option value="">Selecionar canal...</option>
              {channels.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Estratégia de fallback</label>
            <select value={form.redirect_strategy} onChange={e => setForm(f => ({...f, redirect_strategy: e.target.value}))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg">
              <option value="first_active">Primeiro ativo</option>
              <option value="least_full">Menos cheio</option>
              <option value="round_robin">Round robin</option>
            </select>
          </div>
          <p className="text-xs text-fg-3">A cadeia de fallback pode ser configurada após criar o link.</p>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2">Cancelar</button>
            <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-md bg-accent text-white disabled:opacity-50">
              {saving ? 'Criando...' : 'Criar link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PublicLinks() {
  const qc = useQueryClient()
  const [showCreateModal, setShowCreateModal] = React.useState(false)

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
        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>+ Novo link</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !links.length ? (
        <EmptyState title="Nenhum link público" description="Crie links estáveis com fallback automático entre grupos." cta={{ label: 'Criar link', onClick: () => setShowCreateModal(true) }} />
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

      {showCreateModal && <CreateLinkModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}
