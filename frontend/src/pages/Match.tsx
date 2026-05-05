import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Product {
  id: number
  canonical_name?: string
  brand?: string
  image_url?: string
  lowest_price?: number
  lowest_price_source?: string
  tags?: string[]
}

interface MatchScore {
  channel_id: number
  channel_name: string
  score: number
  reasons: string[]
  platform?: string
  member_count?: number
}

// ── Linha de produto com match de canais ─────────────────────────────────────

function ProductMatchRow({ product }: { product: Product }) {
  const navigate = useNavigate()
  const title = product.canonical_name ?? 'Produto'
  const price = product.lowest_price ?? 0
  const source = product.lowest_price_source ?? ''

  const { data: scores, mutate: runMatch, isPending } = useMutation<MatchScore[]>({
    mutationFn: () =>
      apiClient.post('/api/match', {
        product_id: product.id,
        category: (product.tags ?? [])[0] ?? '',
        brand: product.brand ?? '',
        price,
        drop: 0,
      }).then(r => r.data).catch(() => []),
  })

  // Rodar match ao montar
  React.useEffect(() => { runMatch() }, [])

  const topChannels = (scores ?? []).filter(s => s.score >= 30).slice(0, 3)

  return (
    <div className="border border-border rounded-md bg-surface overflow-hidden">
      {/* Cabeçalho do produto */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="w-10 h-10 rounded-sm object-cover bg-surface-2 flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-sm bg-surface-2 flex items-center justify-center flex-shrink-0 text-lg">📦</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fg truncate">{title}</p>
          <p className="text-xs text-fg-3">{source && `${source} · `}{price > 0 ? `R$ ${price.toFixed(2)}` : ''}</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/compose?productId=${product.id}`)}
        >
          ✈ Disparar
        </Button>
      </div>

      {/* Canais com fit */}
      <div className="px-4 py-2.5">
        {isPending ? (
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ) : topChannels.length === 0 ? (
          <p className="text-xs text-fg-3">Nenhum canal compatível — configure canais com audiência.</p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-fg-3">Canais com fit:</span>
            {topChannels.map(s => {
              const color = s.score >= 70 ? 'bg-success/10 text-success' : s.score >= 40 ? 'bg-warning/10 text-warning' : 'bg-surface-2 text-fg-3'
              return (
                <button
                  key={s.channel_id}
                  type="button"
                  onClick={() => navigate(`/compose?productId=${product.id}&targets=${s.channel_id}`)}
                  className={`text-xs px-2 py-0.5 rounded-sm font-medium ${color} hover:opacity-80`}
                  title={`Score ${s.score} · ${s.reasons?.join(', ')}`}
                >
                  {s.channel_name} ({s.score})
                </button>
              )
            })}
            {(scores?.length ?? 0) > 3 && (
              <button
                type="button"
                className="text-xs text-fg-3 hover:text-fg"
                onClick={() => navigate(`/match?productId=${product.id}`)}
              >
                +{(scores?.length ?? 0) - 3} mais →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── View de detalhe: 1 produto × todos os canais ──────────────────────────────

function ProductDetailMatch({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const [minScore, setMinScore] = React.useState(0)
  const [selected, setSelected] = React.useState<number[]>([])

  const { data: product } = useQuery<Product>({
    queryKey: ['catalog', productId],
    queryFn: () => apiClient.get(`/api/catalog/${productId}`).then(r => r.data),
  })

  const { data: scores = [], isPending, mutate: runMatch } = useMutation<MatchScore[]>({
    mutationFn: () =>
      apiClient.post('/api/match', {
        product_id: Number(productId),
        category: (product?.tags ?? [])[0] ?? '',
        brand: product?.brand ?? '',
        price: product?.lowest_price ?? 0,
        drop: 0,
      }).then(r => r.data).catch(() => []),
  })

  React.useEffect(() => { if (product || productId) runMatch() }, [product])

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const filtered = scores.filter(s => s.score >= minScore)
  const greenCount = filtered.filter(s => s.score >= 70).length

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <button type="button" onClick={() => navigate('/match')} className="text-fg-3 hover:text-fg text-sm">← Todos os produtos</button>
        {product && (
          <span className="text-sm font-medium text-fg">{product.canonical_name}</span>
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-3 border-b border-border flex-wrap">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          Score mínimo: <b className="text-fg">{minScore}</b>
          <input type="range" min={0} max={100} step={5} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-28 accent-accent" />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isPending ? (
          Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum canal compatível" description="Configure canais com perfil de audiência." />
        ) : (
          filtered.map(s => {
            const pct = s.score
            const barColor = pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-danger'
            const textColor = pct >= 70 ? 'text-success' : pct >= 40 ? 'text-warning' : 'text-danger'
            return (
              <div key={s.channel_id} onClick={() => toggle(s.channel_id)}
                className={`flex items-center gap-4 p-3 border rounded-md cursor-pointer transition-colors ${
                  selected.includes(s.channel_id) ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <div className={`w-1 h-10 rounded-full flex-shrink-0 ${barColor}`} />
                <input type="checkbox" checked={selected.includes(s.channel_id)}
                  onChange={() => toggle(s.channel_id)} className="accent-accent"
                  onClick={e => e.stopPropagation()} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">{s.channel_name}</p>
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {(s.reasons ?? []).map((r, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded-sm bg-success/10 text-success">+ {r}</span>
                    ))}
                  </div>
                </div>
                <div className="w-20 flex-shrink-0">
                  <span className={`text-lg font-bold ${textColor}`}>{pct}</span>
                  <div className="h-1 bg-surface-2 rounded-full mt-1">
                    <div className={`h-full rounded-full ${barColor}`} style={{width:`${pct}%`}} />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-border p-4 flex items-center justify-between">
        <span className="text-sm text-fg-2">{selected.length} selecionado(s)</span>
        <div className="flex gap-2">
          {greenCount > 0 && selected.length === 0 && (
            <Button variant="secondary" size="sm"
              onClick={() => setSelected(filtered.filter(s=>s.score>=70).map(s=>s.channel_id))}>
              Selecionar {greenCount} verde{greenCount!==1?'s':''}
            </Button>
          )}
          <Button variant="primary"
            disabled={selected.length === 0}
            onClick={() => navigate(`/compose?productId=${productId}&targets=${selected.join(',')}`)}>
            ✈ Disparar para {selected.length > 0 ? selected.length : `os ${greenCount} verdes`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Match() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const [search, setSearch] = React.useState('')

  // Se tem productId → view de detalhe
  if (productId) {
    return <ProductDetailMatch productId={productId} />
  }

  // Sem productId → lista de produtos do catálogo com match inline
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <h1 className="text-lg font-semibold text-fg">Match</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Produtos do catálogo × canais compatíveis — clique em um canal para disparar direto.
        </p>
      </div>

      <div className="px-6 py-3 border-b border-border flex-shrink-0">
        <input
          className="w-72 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <ProductList search={search} navigate={navigate} />
    </div>
  )
}

function ProductList({ search, navigate }: { search: string; navigate: ReturnType<typeof useNavigate> }) {
  const { data: raw = [], isLoading } = useQuery<Product[]>({
    queryKey: ['catalog', 'match-list'],
    queryFn: () => apiClient.get('/api/catalog?limit=50').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
    ).catch(() => []),
    staleTime: 60_000,
  })

  const products = search
    ? raw.filter(p => (p.canonical_name ?? '').toLowerCase().includes(search.toLowerCase()))
    : raw

  if (isLoading) {
    return <div className="p-6 space-y-3">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
  }

  if (products.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState
          title="Nenhum produto no catálogo"
          description="Configure crawlers para coletar produtos e o match será calculado automaticamente."
          cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-3">
      {products.map(p => (
        <ProductMatchRow key={p.id} product={p} />
      ))}
    </div>
  )
}
