import { authFetch } from '../authFetch'

// CanonicalProduct representa um produto canônico consolidado entre marketplaces.
// A lista (/canonical-groups) traz contagem e marketplaces; os filhos são
// buscados sob demanda ao expandir (fetchCanonicalGroupChildren).
export interface CanonicalProduct {
  id: number
  name: string
  low_confidence: boolean
  marketplaces: string[]
  marketplace_count: number
  children_count: number
}

// CanonicalChild representa um item de catálogo filho vinculado ao produto canônico.
export interface CanonicalChild {
  id: number
  title: string
  source_id: string
  marketplace: string
  price_current?: number
}

// CanonicalGroupsFilter contém os filtros suportados pela listagem de grupos canônicos.
export interface CanonicalGroupsFilter {
  brand?: string
  low_confidence?: boolean
}

// Linha crua do backend GET /api/admin/canonical-groups.
interface CanonicalGroupFlat {
  id: number
  title_canonical: string
  brand_id: number | null
  low_confidence: boolean
  children_count: number
  marketplaces: string[] | null
}

// fetchCanonicalGroups busca a lista de grupos canônicos com filtros opcionais.
// Mapeia a resposta crua do backend (title_canonical, marketplaces[]) para o
// shape da UI. Retorna [] se o endpoint retornar 404 (feature não habilitada).
export async function fetchCanonicalGroups(
  filter: CanonicalGroupsFilter = {},
): Promise<CanonicalProduct[]> {
  const params = new URLSearchParams()
  if (filter.brand) {
    params.set('brand', filter.brand)
  }
  if (filter.low_confidence !== undefined) {
    params.set('low_confidence', String(filter.low_confidence))
  }

  const query = params.toString()
  const url = query ? `/api/admin/canonical-groups?${query}` : '/api/admin/canonical-groups'
  const r = await authFetch(url)

  if (r.status === 404) {
    return []
  }
  if (!r.ok) {
    throw new Error(`fetchCanonicalGroups ${r.status}`)
  }
  const raw = (await r.json()) as CanonicalGroupFlat[]
  if (!Array.isArray(raw)) return []
  return raw.map(g => {
    const marketplaces = Array.isArray(g.marketplaces) ? g.marketplaces.filter(Boolean) : []
    return {
      id: g.id,
      name: g.title_canonical || `#${g.id}`,
      low_confidence: !!g.low_confidence,
      marketplaces,
      marketplace_count: marketplaces.length,
      children_count: g.children_count ?? 0,
    }
  })
}

// fetchCanonicalGroupChildren busca os itens de catálogo filhos de um grupo canônico
// (sob demanda, ao expandir). Retorna [] em 404.
export async function fetchCanonicalGroupChildren(id: number): Promise<CanonicalChild[]> {
  const r = await authFetch(`/api/admin/canonical-groups/${id}/children`)
  if (r.status === 404) {
    return []
  }
  if (!r.ok) {
    throw new Error(`fetchCanonicalGroupChildren ${r.status}`)
  }
  const raw = await r.json()
  return Array.isArray(raw) ? (raw as CanonicalChild[]) : []
}
