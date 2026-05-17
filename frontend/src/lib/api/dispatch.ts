import { authFetch } from '../authFetch'

// ModemRoutingRow representa uma linha da tabela modem_routing.
export interface ModemRoutingRow {
  modem_id: number
  domain_id: number
  domain_name?: string
  affinity_score: number
  enabled: boolean
  last_used_at?: string
}

// RateBucketScopeType são os tipos de escopo suportados pelos rate buckets.
export type RateBucketScopeType = 'group' | 'channel' | 'modem'

// RateBucketRow representa uma linha da tabela rate_buckets.
export interface RateBucketRow {
  id: number
  scope_type: RateBucketScopeType
  scope_id: number
  tokens_per_minute: number
  current_tokens: number
  refilled_at?: string
}

// fetchModemRouting busca todas as entradas da tabela de roteamento por modem.
// Retorna array vazio se o endpoint retornar 404.
export async function fetchModemRouting(): Promise<ModemRoutingRow[]> {
  const r = await authFetch('/api/admin/dispatch/routing')
  if (r.status === 404) {
    return []
  }
  if (!r.ok) {
    throw new Error(`fetchModemRouting ${r.status}`)
  }
  return r.json()
}

// fetchRateBuckets busca todas as entradas da tabela de rate buckets.
// Retorna array vazio se o endpoint retornar 404.
export async function fetchRateBuckets(): Promise<RateBucketRow[]> {
  const r = await authFetch('/api/admin/dispatch/rate-buckets')
  if (r.status === 404) {
    return []
  }
  if (!r.ok) {
    throw new Error(`fetchRateBuckets ${r.status}`)
  }
  return r.json()
}

// toggleRouting alterna a afinidade de um par modem × domain via PATCH.
export async function toggleRouting(
  modemID: number,
  domainID: number,
  enabled: boolean,
): Promise<void> {
  const r = await authFetch(`/api/admin/dispatch/routing/${modemID}/${domainID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!r.ok) {
    throw new Error(`toggleRouting ${r.status}`)
  }
}
