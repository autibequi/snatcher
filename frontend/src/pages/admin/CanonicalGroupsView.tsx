import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCanonicalGroups, type CanonicalProduct, type CanonicalChild } from '../../lib/api/canonical'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Switch } from '../../components/ui'
import { pageContainer, sectionCard, tblDense, thDense, tdDense, trDense } from '../../lib/uiTokens'
import { mythosEmpty } from '../../lib/copy/mythos'

// MARKETPLACE_PLATFORMS lista os marketplaces conhecidos para exibição no badge de cobertura.
const MARKETPLACE_PLATFORMS = ['Amazon', 'ML', 'Shopee', 'B2W', 'Magalu']

// marketplaceBadgeVariant retorna a variante de Badge para um marketplace.
function marketplaceBadgeVariant(marketplace: string): 'accent' | 'default' {
  const known = MARKETPLACE_PLATFORMS.map(p => p.toLowerCase())
  return known.includes(marketplace.toLowerCase()) ? 'accent' : 'default'
}

// ChildrenTable exibe os produtos filhos de um grupo canônico.
function ChildrenTable({ children }: { children: CanonicalChild[] }) {
  if (children.length === 0) {
    return (
      <EmptyState
        title="Sem filhos cadastrados"
        description="Este produto canônico ainda não tem itens vinculados nos marketplaces."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded border border-border mt-2">
      <table className={tblDense}>
        <thead>
          <tr>
            <th className={thDense}>Título</th>
            <th className={thDense}>Marketplace</th>
            <th className={thDense}>Source</th>
            <th className={thDense}>Preço</th>
          </tr>
        </thead>
        <tbody>
          {children.map((child) => (
            <tr key={child.id} className={trDense}>
              <td className={tdDense}>
                <span className="line-clamp-1 max-w-xs">{child.title}</span>
              </td>
              <td className={tdDense}>
                <Badge variant={marketplaceBadgeVariant(child.marketplace)}>
                  {child.marketplace}
                </Badge>
              </td>
              <td className={`${tdDense} font-mono text-xs text-fg-3`}>{child.source_id}</td>
              <td className={tdDense}>
                {child.price_current !== undefined
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      child.price_current,
                    )
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ProductRow exibe um produto canônico com toggle de expansão para filhos.
function ProductRow({ product }: { product: CanonicalProduct }) {
  const [expanded, setExpanded] = useState(false)

  // Coleta marketplaces únicos dos filhos para exibição no badge de cobertura
  const uniqueMarketplaces = [...new Set(product.children.map((child) => child.marketplace))]

  return (
    <div className={`${sectionCard} transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-fg">{product.name}</span>
            {product.low_confidence && (
              <Badge variant="warning">baixa confiança</Badge>
            )}
          </div>
          {product.brand && (
            <p className="text-xs text-fg-3 mb-2">{product.brand}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {uniqueMarketplaces.map((marketplace) => (
              <Badge key={marketplace} variant={marketplaceBadgeVariant(marketplace)} size="sm">
                {marketplace}
              </Badge>
            ))}
            <Badge variant="outline" size="sm">
              {product.marketplace_count} marketplace{product.marketplace_count !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Fechar' : `Ver filhos (${product.children.length})`}
        </Button>
      </div>
      {expanded && <ChildrenTable children={product.children} />}
    </div>
  )
}

// CanonicalGroupsView é a tela de visualização de grupos de produtos canônicos.
export default function CanonicalGroupsView() {
  const [brandFilter, setBrandFilter] = useState('')
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['canonical-groups', { brand: brandFilter, low_confidence: lowConfidenceOnly }],
    queryFn: () =>
      fetchCanonicalGroups({
        brand: brandFilter || undefined,
        low_confidence: lowConfidenceOnly || undefined,
      }),
  })

  function renderContent() {
    if (isLoading) {
      return (
        <div className="space-y-3">
          <Skeleton variant="card" className="h-20" />
          <Skeleton variant="card" className="h-20" />
          <Skeleton variant="card" className="h-20" />
        </div>
      )
    }

    if (isError) {
      return (
        <EmptyState
          title="Erro ao carregar grupos canônicos"
          description="Não foi possível buscar os dados. Verifique o backend ou tente novamente."
        />
      )
    }

    if (!data || data.length === 0) {
      return (
        <EmptyState
          title="Nenhum grupo canônico encontrado"
          description={mythosEmpty.canonical}
        />
      )
    }

    return (
      <div className="space-y-3">
        {data.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </div>
    )
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Grupos Canônicos" className="mb-4" />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          placeholder="Filtrar por marca..."
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="w-56"
        />
        <label className="flex items-center gap-2 text-sm text-fg-2 cursor-pointer">
          <Switch
            checked={lowConfidenceOnly}
            onChange={setLowConfidenceOnly}
          />
          Apenas baixa confiança
        </label>
      </div>

      {renderContent()}
    </div>
  )
}
