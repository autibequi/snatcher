import { authFetch } from '../authFetch'

// CanonicalProduct representa um produto canônico consolidado entre marketplaces.
export interface CanonicalProduct {
  id: number
  name: string
  brand?: string
  low_confidence: boolean
  marketplace_count: number
  children: CanonicalChild[]
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

// fetchCanonicalGroups busca a lista de grupos canônicos com filtros opcionais.
// Retorna array vazio se o endpoint retornar 404 (feature não habilitada).
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
  return r.json()
}
