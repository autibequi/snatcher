import { authFetch } from '../authFetch'

export interface BaselineSnapshot {
  id: number
  captured_at: string
  scope: string
  metrics: Record<string, number | object>
}

export interface BaselineDiff {
  from: BaselineSnapshot
  to: BaselineSnapshot
  diff: Record<string, { before: number; after: number; delta_pct: number }>
}

export interface CaptureBaselineRequest {
  scope?: string
  metrics?: string[]
}

export interface CaptureBaselineResponse {
  snapshot_id: number
  captured_at: string
  metrics: Record<string, number | object>
}

export async function captureBaseline(
  req: CaptureBaselineRequest = {},
): Promise<CaptureBaselineResponse> {
  const res = await authFetch('/api/admin/baseline/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`captureBaseline failed: ${res.status}`)
  return res.json()
}

export async function compareBaseline(fromID: number, toID: number): Promise<BaselineDiff> {
  const params = new URLSearchParams({ from: String(fromID), to: String(toID) })
  const res = await authFetch(`/api/admin/baseline/compare?${params}`)
  if (!res.ok) throw new Error(`compareBaseline failed: ${res.status}`)
  return res.json()
}

export async function listBaselineSnapshots(limit = 30): Promise<BaselineSnapshot[]> {
  // Endpoint complementar — verificar se card 005 expõe; se não, criar GET /baseline?limit=N
  const res = await authFetch(`/api/admin/baseline?limit=${limit}`)
  if (!res.ok) throw new Error(`listBaselineSnapshots failed: ${res.status}`)
  return res.json()
}
