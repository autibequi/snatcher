import { apiClient } from '../apiClient'

// ── Types ─────────────────────────────────────────────────────────────────────

// IntelligenceRankedEntry representa um produto no ranking com breakdown de score.
export interface IntelligenceRankedEntry {
  id: number
  title: string
  price: number
  quality_score: number
  discount_pct: number
  economia?: number
  score: number
  target_reason: string
  reasons: string[]
}

// IntelligenceEnqueuedTop é o produto no topo do ranking (seria enviado no próximo tick).
export interface IntelligenceEnqueuedTop {
  id: number
  title: string
  price: number
  score: number
}

// IntelligenceGates representa os 4 semáforos de pré-condição para disparo.
export interface IntelligenceGates {
  in_window: boolean
  pacing_ok: boolean
  has_channel: boolean
  has_modem: boolean
}

// IntelligenceGroupResult é a resposta completa do endpoint GET /api/admin/intelligence/group/{id}.
export interface IntelligenceGroupResult {
  group_id: number
  enqueued_top: IntelligenceEnqueuedTop | null
  ranked: IntelligenceRankedEntry[]
  gates: IntelligenceGates
}

// ── API ───────────────────────────────────────────────────────────────────────

// fetchIntelligenceGroup busca o estado do motor de inteligência para um grupo.
// Retorna null se o grupo não for encontrado (404).
export async function fetchIntelligenceGroup(groupId: number): Promise<IntelligenceGroupResult | null> {
  const r = await apiClient.get<IntelligenceGroupResult>(
    `/api/admin/intelligence/group/${groupId}`
  )
  return r.data
}
