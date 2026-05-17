import { authFetch } from '../authFetch'

// JonfreyDecision representa uma decisão registrada pelo sistema Jonfrey.
export interface JonfreyDecision {
  id: number
  automation_id: number
  decision_type: string
  payload?: Record<string, unknown>
  created_at: string
}

// JonfreyDecisionsFilter contém os filtros suportados pela listagem de decisões.
export interface JonfreyDecisionsFilter {
  automation_id?: number
  decision_type?: string
}

// JonfreyDecisionsResponse é o envelope de resposta do endpoint de decisões.
export interface JonfreyDecisionsResponse {
  decisions: JonfreyDecision[]
  escalate_count_24h: number
}

// fetchJonfreyDecisions busca a timeline reversa de decisões do sistema Jonfrey.
// Retorna estrutura vazia se o endpoint retornar 404 (feature não habilitada).
export async function fetchJonfreyDecisions(
  filter: JonfreyDecisionsFilter = {},
): Promise<JonfreyDecisionsResponse> {
  const params = new URLSearchParams()
  if (filter.automation_id !== undefined) {
    params.set('automation_id', String(filter.automation_id))
  }
  if (filter.decision_type) {
    params.set('decision_type', filter.decision_type)
  }

  const query = params.toString()
  const url = query
    ? `/api/admin/jonfrey/decisions?${query}`
    : '/api/admin/jonfrey/decisions'

  const r = await authFetch(url)
  if (r.status === 404) {
    return { decisions: [], escalate_count_24h: 0 }
  }
  if (!r.ok) {
    throw new Error(`fetchJonfreyDecisions ${r.status}`)
  }

  const data = await r.json()
  // Normaliza caso o backend retorne array direto em vez do envelope
  if (Array.isArray(data)) {
    return { decisions: data, escalate_count_24h: 0 }
  }
  return data as JonfreyDecisionsResponse
}
