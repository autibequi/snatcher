import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Badge, Button, Skeleton, EmptyState, Input, Tabs } from '../components/ui'
import { apiClient } from '../lib/apiClient'

const TABS = [
  { id: 'new', label: 'Novos' },
  { id: 'curated', label: 'Curados' },
  { id: 'sent', label: 'Disparados 7d' },
  { id: 'all', label: 'Tudo' },
]

interface Product {
  id: number
  canonical_name?: string
  brand?: string
  image_url?: string
  lowest_price?: number
  lowest_price_source?: string
  tags?: string[]
  created_at?: string
}

function PriceSparkline({ productId }: { productId: number }) {
  const { data: history = [] } = useQuery({
    queryKey: ['catalog', 'history', productId],
    queryFn: () =>
      apiClient
        .get(`/api/catalog/variants/${productId}/history`)
        .then(r => (Array.isArray(r.data) ? r.data.slice(-10) : []))
        .catch(() => []),
    staleTime: 5 * 60_000,
    enabled: !!productId,
  })

  if (history.length < 2) return null

  const data = history.map((h: any) => ({ v: h.price ?? h.value ?? 0 }))
  const prices = data.map((d: any) => d.v)
  const isDown = prices[prices.length - 1] < prices[0]

  return (
    <div className="w-16 h-6 inline-block">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={isDown ? '#22c55e' : '#ef4444'}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function AddProductModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = React.useState({
    canonical_name: '',
    brand: '',
    lowest_price: '',
    lowest_price_source: 'amazon',
    image_url: '',
    tags: '',
  })
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.canonical_name.trim()) return
    setSaving(true)
    try {
      await apiClient.post('/api/catalog', {
        canonical_name: form.canonical_name.trim(),
        brand: form.brand.trim() || undefined,
        lowest_price: form.lowest_price ? Number(form.lowest_price) : undefined,
        lowest_price_source: form.lowest_price_source || undefined,
        image_url: form.image_url.trim() || undefined,
        tags: form.tags
          ? form.tags
              .split(',')
              .map(t => t.trim())
              .filter(Boolean)
          : [],
      })
      onSuccess()
      onClose()
    } catch (err) {
      alert('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-fg mb-4">Adicionar produto manual</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Nome do produto *</label>
            <input
              required
              value={form.canonical_name}
              onChange={e => setForm(f => ({ ...f, canonical_name: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              placeholder="Whey Protein 900g Growth..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-2 block mb-1">Marca</label>
              <input
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Preco (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.lowest_price}
                onChange={e => setForm(f => ({ ...f, lowest_price: e.target.value }))}
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                placeholder="89.90"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Fonte</label>
            <select
              value={form.lowest_price_source}
              onChange={e => setForm(f => ({ ...f, lowest_price_source: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            >
              {[
                'amazon',
                'mercadolivre',
                'magalu',
                'shopee',
                'aliexpress',
                'casasbahia',
                'kabum',
                'americanas',
                'manual',
              ].map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">URL da imagem</label>
            <input
              value={form.image_url}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Tags (separadas por virgula)</label>
            <input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              placeholder="suplemento, whey, proteina"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2 hover:bg-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Adicionar produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Catalog() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [showAddModal, setShowAddModal] = React.useState(false)

  const { data: rawProducts = [], isLoading } = useQuery<Product[]>({
    queryKey: ['catalog', tab, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      return apiClient.get(`/api/catalog?${params}`).then(r => {
        const d = r.data
        return Array.isArray(d) ? d : (d?.items ?? d?.products ?? [])
      })
    },
    staleTime: 30_000,
  })

  const products = rawProducts

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(products.map(p => p.id)))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-fg">Catalogo</h1>
            <p className="text-sm text-fg-3 mt-0.5">
              {products.length} produto{products.length !== 1 ? 's' : ''} coletado
              {products.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const ids = Array.from(selected).join(',')
                  navigate(`/compose?productIds=${ids}`)
                }}
              >
                Disparar selecionados ({selected.size})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>
              + Adicionar manual
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={TABS}
          active={tab}
          onChange={t => {
            setTab(t)
            setSelected(new Set())
          }}
        />
      </div>

      {/* Filtros */}
      <div className="px-6 py-3 flex gap-3 border-b border-border flex-shrink-0">
        <div className="w-72">
          <Input
            placeholder="Buscar por nome, marca, tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-fg"
          onChange={() => {}}
        >
          <option value="">Todas as fontes</option>
          <option value="amazon">Amazon</option>
          <option value="mercadolivre">Mercado Livre</option>
          <option value="magalu">Magalu</option>
          <option value="shopee">Shopee</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhum produto"
              description="Configure um crawler para comecar a coletar produtos."
              cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface border-b border-border z-10">
              <tr>
                <th className="w-10 px-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === products.length && products.length > 0}
                    onChange={toggleAll}
                    className="accent-accent"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-2 uppercase tracking-wide">
                  Produto
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-fg-2 uppercase tracking-wide">
                  Preco
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-fg-2 uppercase tracking-wide">
                  Desconto
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-2 uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const title = p.canonical_name ?? 'Produto'
                const price = p.lowest_price ?? 0
                const source = p.lowest_price_source ?? ''
                const isSelected = selected.has(p.id)

                return (
                  <tr
                    key={p.id}
                    className={`border-b border-border hover:bg-surface-2 transition-colors ${isSelected ? 'bg-accent/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="accent-accent"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-surface-2 rounded-sm overflow-hidden flex-shrink-0">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex items-center justify-center h-full text-lg">
                              📦
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-fg line-clamp-1">{title}</p>
                          {p.brand && (
                            <p className="text-xs text-fg-3">
                              {p.brand}
                              {source ? ` · ${source}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <PriceSparkline productId={p.id} />
                        {price > 0 ? (
                          <span className="font-semibold text-fg">R$ {price.toFixed(2)}</span>
                        ) : (
                          '—'
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="success" size="sm">
                        novo
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default" size="sm">
                        • novo
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => navigate(`/match?productId=${p.id}`)}
                        >
                          Enviar
                        </Button>
                        <a href="#" className="text-fg-3 hover:text-fg p-1" title="Link externo">
                          🔗
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['catalog'] })}
        />
      )}
    </div>
  )
}
