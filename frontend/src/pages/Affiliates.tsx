import React from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface AffiliateProgram {
  id: number
  short_id: string
  name: string
  marketplace: string
  active: boolean
  rules: unknown
  postback: unknown
}

const MARKETPLACES = ['amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress', 'casasbahia', 'kabum', 'americanas']

function CreateProgramModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    name: '',
    marketplace: 'amazon',
    active: true,
    tag: '',
    affiliate_id: '',
  })
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const credentials: Record<string, string> = {}
    if (form.tag) credentials.tag = form.tag
    if (form.affiliate_id) credentials.affiliate_id = form.affiliate_id
    try {
      await apiClient.post('/api/affiliates/programs', {
        name: form.name.trim(),
        marketplace: form.marketplace,
        active: form.active,
        credentials: JSON.stringify(credentials),
        rules: JSON.stringify({ priority: 10 }),
        postback: JSON.stringify({ enabled: false }),
      })
      qc.invalidateQueries({ queryKey: ['affiliates', 'programs'] })
      onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao criar programa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-fg mb-4">Novo programa de afiliado</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Nome do programa *</label>
            <input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              placeholder="Amazon Associates BR" />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Marketplace *</label>
            <select value={form.marketplace} onChange={e => setForm(f => ({...f, marketplace: e.target.value}))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg">
              {MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {form.marketplace === 'amazon' && (
            <div>
              <label className="text-xs text-fg-2 block mb-1">Amazon Tag (tracking ID)</label>
              <input value={form.tag} onChange={e => setForm(f => ({...f, tag: e.target.value}))}
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                placeholder="snatcher-20" />
            </div>
          )}
          {form.marketplace !== 'amazon' && (
            <div>
              <label className="text-xs text-fg-2 block mb-1">ID de afiliado</label>
              <input value={form.affiliate_id} onChange={e => setForm(f => ({...f, affiliate_id: e.target.value}))}
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({...f, active: e.target.checked}))} className="accent-accent" />
            <span className="text-sm text-fg">Ativo</span>
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2">Cancelar</button>
            <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-md bg-accent text-white disabled:opacity-50">
              {saving ? 'Salvando...' : 'Criar programa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Affiliates() {
  const qc = useQueryClient()
  const [buildLinkProductUrl, setBuildLinkProductUrl] = React.useState('')
  const [buildLinkMarketplace, setBuildLinkMarketplace] = React.useState('')
  const [builtLink, setBuiltLink] = React.useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = React.useState(false)

  const { data: programs = [], isLoading } = useQuery<AffiliateProgram[]>({
    queryKey: ['affiliates', 'programs'],
    queryFn: () => apiClient.get('/api/affiliates/programs').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/affiliates/programs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates'] }),
  })

  const buildLink = async () => {
    if (!buildLinkProductUrl || !buildLinkMarketplace) return
    try {
      const r = await apiClient.post('/api/affiliates/build-link', {
        product_url: buildLinkProductUrl,
        marketplace: buildLinkMarketplace,
      })
      setBuiltLink(r.data.url)
    } catch {
      setBuiltLink('Erro ao construir link')
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-fg mb-6">Afiliados</h1>

      {/* Lista de programas */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-fg-2">Programas</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>+ Novo programa</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !programs.length ? (
          <EmptyState title="Nenhum programa" description="Configure programas de afiliados para monetizar os links." cta={{ label: 'Criar programa', onClick: () => setShowCreateModal(true) }} />
        ) : (
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Nome', 'Marketplace', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left p-3 text-fg-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {programs.map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="p-3 font-medium text-fg">{p.name}</td>
                    <td className="p-3"><Badge size="sm">{p.marketplace}</Badge></td>
                    <td className="p-3"><Badge variant={p.active ? 'success' : 'default'} size="sm">{p.active ? 'ativo' : 'inativo'}</Badge></td>
                    <td className="p-3">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          if (confirm('Deletar programa?')) deleteMut.mutate(p.id)
                        }}
                      >
                        Deletar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Build link */}
      <div className="bg-surface border border-border rounded-md p-4 max-w-lg">
        <h2 className="text-sm font-medium text-fg mb-3">Preview link de afiliado</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">URL do produto</label>
            <input
              type="text"
              value={buildLinkProductUrl}
              onChange={e => setBuildLinkProductUrl(e.target.value)}
              placeholder="https://amazon.com.br/..."
              className="w-full text-sm px-2.5 h-8 rounded-md border border-border bg-surface text-fg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Marketplace</label>
            <select
              value={buildLinkMarketplace}
              onChange={e => setBuildLinkMarketplace(e.target.value)}
              className="w-full text-sm px-2.5 h-8 rounded-md border border-border bg-surface text-fg focus:outline-none focus:border-accent"
            >
              <option value="">Selecione</option>
              {['amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <Button variant="secondary" size="sm" onClick={buildLink}>
            Construir link
          </Button>
          {builtLink && (
            <div className="bg-surface-2 p-2 rounded text-xs text-fg font-mono break-all">{builtLink}</div>
          )}
        </div>
      </div>

      {showCreateModal && <CreateProgramModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}
