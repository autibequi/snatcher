import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import TagInput from '../components/TagInput'

interface Product {
  id: number
  canonical_name: string
  brand?: string | null
  image_url?: string | null
  lowest_price?: number | null
  tags: string
  curation_status: string
  created_at: string
}

interface StatRow {
  status: string
  count: number
}

export default function Curation() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['curation', 'needs-taxonomy'],
    queryFn: () =>
      apiClient
        .get('/api/curation/needs-taxonomy?limit=100')
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const { data: stats = [] } = useQuery<StatRow[]>({
    queryKey: ['curation', 'stats'],
    queryFn: () =>
      apiClient.get('/api/curation/stats').then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const filtered = products.filter(p =>
    !search || p.canonical_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPending = stats.find(s => s.status === 'pending')?.count ?? 0
  const totalAuto = stats.find(s => s.status === 'auto')?.count ?? 0
  const totalCurated = stats.find(s => s.status === 'curated')?.count ?? 0
  const totalRejected = stats.find(s => s.status === 'rejected')?.count ?? 0

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/curation/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['curation'] })
    },
  })

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-fg">Curadoria</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Produtos do crawl que não foram inferidos automaticamente — cadastre categoria e marca pra entrar no Match.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Pendentes" value={totalPending} accent="warning" />
        <StatCard label="Auto-inferidos" value={totalAuto} accent="success" />
        <StatCard label="Curados manual" value={totalCurated} accent="default" />
        <StatCard label="Rejeitados" value={totalRejected} accent="default" />
      </div>

      <div className="mb-3">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-fg-3">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="border border-border rounded-md p-8 text-center">
          <p className="text-sm text-fg-2">
            {totalPending === 0
              ? 'Nada pendente — todos os produtos foram inferidos automaticamente. ✨'
              : 'Nenhum produto com esse filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <ProductRow
              key={p.id}
              product={p}
              onRejected={() => rejectMut.mutate(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'warning' | 'success' | 'default'
}) {
  const color =
    accent === 'warning'
      ? 'text-warning'
      : accent === 'success'
      ? 'text-success'
      : 'text-fg-2'
  return (
    <div className="border border-border rounded-md p-3 bg-surface">
      <p className="text-xs text-fg-3 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

function ProductRow({
  product,
  onRejected,
}: {
  product: Product
  onRejected: () => void
}) {
  const qc = useQueryClient()
  const [categories, setCategories] = useState<string[]>([])
  const [brand, setBrand] = useState<string[]>(product.brand ? [product.brand] : [])
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/curation/${product.id}/taxonomy`, {
        categories,
        brand: brand[0] ?? '',
      }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['curation'] })
      }, 800)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  return (
    <div className="border border-border rounded-md p-3 bg-surface flex gap-4">
      {product.image_url ? (
        <img
          src={product.image_url}
          alt=""
          className="w-20 h-20 rounded-md object-cover bg-surface-2 flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-md bg-surface-2 flex items-center justify-center text-fg-3 text-xs flex-shrink-0">
          sem foto
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-fg truncate" title={product.canonical_name}>
            {product.canonical_name}
          </p>
          {product.lowest_price && (
            <span className="text-xs text-fg-2 font-mono whitespace-nowrap">
              R$ {product.lowest_price.toFixed(2)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-fg-3 block mb-0.5">Categoria(s)</label>
            <TagInput
              type="category"
              value={categories}
              onChange={setCategories}
              placeholder="ex: smartphones"
            />
          </div>
          <div>
            <label className="text-xs text-fg-3 block mb-0.5">Marca</label>
            <TagInput
              type="brand"
              value={brand}
              onChange={next => setBrand(next.slice(0, 1))}
              placeholder="ex: Apple"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onRejected}
            className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
          >
            Rejeitar
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => saveMut.mutate()}
            loading={saveMut.isPending}
            disabled={categories.length === 0 && brand.length === 0}
          >
            {saved ? '✓ Salvo' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
