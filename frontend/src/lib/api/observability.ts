import { authFetch } from '../authFetch'

// HealthResponse descreve o payload de GET /api/admin/health.
export interface HealthResponse {
  dispatcher: { queue_depth: number; active_workers: number }
  circuit_breaker: Record<string, string>
  llm: { cost_today_usd_total: number; [k: string]: number }
  catalog: Record<string, number>
}

// fetchHealth busca o snapshot de saúde atual do sistema.
export async function fetchHealth(): Promise<HealthResponse> {
  const r = await authFetch('/api/admin/health')
  if (!r.ok) {
    throw new Error(`fetchHealth ${r.status}`)
  }
  return r.json()
}
