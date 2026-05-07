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
  quantity?: string
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
  const totalIncomplete = stats.find(s => s.status === 'incomplete')?.count ?? 0

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/curation/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curation'] }),
  })

  const autoHeuristicMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/auto-heuristic').then(r => r.data as { processed: number; categorized: number; branded: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['curation'] })
      alert(`Heurísticas: ${data.categorized} categorizados, ${data.branded} marcas preenchidas (de ${data.processed} processados).`)
    },
    onError: () => alert('Erro ao rodar heurísticas'),
  })

  const reprocessMut = useMutation({
    mutationFn: () => apiClient.post('/api/catalog/reprocess').then(r => r.data as { branded: number; cleaned: number; categorized: number; total: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['curation'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
      alert(`Reprocessamento da base: ${data.branded} marcas preenchidas, ${data.cleaned} títulos limpos, ${data.categorized} categorias adicionadas (de ${data.total} produtos).`)
    },
    onError: () => alert('Erro ao reprocessar'),
  })

  const autoLLMMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/auto-llm').then(r => r.data as { processed: number; categorized: number; new_taxonomies: number; message?: string; first_error?: string; errors?: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['curation'] })
      if (data.message) {
        alert(data.message)
      } else {
        const tax = data.new_taxonomies > 0 ? ` · ${data.new_taxonomies} novas taxonomias sugeridas (veja em Taxonomia → Pendentes)` : ''
        const errs = data.errors ? ` · ${data.errors} erros: ${data.first_error ?? ''}` : ''
        alert(`LLM: ${data.categorized} de ${data.processed} produtos categorizados.${tax}${errs}`)
      }
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? '?'
      const detail = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
      alert(`Erro ao rodar LLM (HTTP ${status}): ${detail}\n\nVeja /logs → tab LLM para detalhes.`)
    },
  })

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <p className="text-sm text-fg-3">
            Produtos sem marca, categoria ou atributos completos — mesmo que já estejam no catálogo.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (confirm('Reprocessar TODA a base do catálogo? Pode demorar alguns segundos.')) {
                reprocessMut.mutate()
              }
            }}
            loading={reprocessMut.isPending}
            title="Roda taxonomia + limpeza de título em todos os produtos"
          >
            🔄 Reprocessar base
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => autoHeuristicMut.mutate()}
            loading={autoHeuristicMut.isPending}
            title="Roda taxonomy matching nos produtos pendentes/incompletos"
          >
            ⚡ Auto (heurísticas)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => autoLLMMut.mutate()}
            loading={autoLLMMut.isPending}
            title="Usa LLM para inferir categoria, marca e quantidade (até 20 por rodada)"
          >
            🤖 Auto (LLM)
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label="Pendentes" value={totalPending} accent="warning" />
        <StatCard label="Incompletos" value={totalIncomplete} accent="warning" />
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
            {totalPending === 0 && totalIncomplete === 0
              ? 'Todos os produtos estão completos. ✨'
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
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg truncate" title={product.canonical_name}>
              {product.canonical_name}
            </p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {product.curation_status !== 'pending' && (
                <span className="text-xs px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-3">
                  {product.curation_status}
                </span>
              )}
              {(!product.brand) && (
                <span className="text-xs px-1.5 py-0.5 bg-warning/10 border border-warning/30 rounded text-warning">
                  sem marca
                </span>
              )}
              {(!product.tags || product.tags === '[]') && (
                <span className="text-xs px-1.5 py-0.5 bg-warning/10 border border-warning/30 rounded text-warning">
                  sem categoria
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {product.quantity && (
              <span className="text-xs px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-2">
                {product.quantity}
              </span>
            )}
            {product.lowest_price && (
              <span className="text-xs text-fg-2 font-mono">
                R$ {product.lowest_price.toFixed(2)}
              </span>
            )}
          </div>
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
