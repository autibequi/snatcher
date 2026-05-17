import { authFetch } from '../authFetch'

// TaxonomyNodeKind são os tipos suportados pelo filtro de nó da árvore.
export type TaxonomyNodeKind = 'brand' | 'category' | 'subcategory' | 'attribute'

// TaxonomyNode representa um nó da árvore de taxonomia (recursivo).
export interface TaxonomyNode {
  id: number
  name: string
  kind: TaxonomyNodeKind
  parent_id: number | null
  children: TaxonomyNode[]
}

// TaxonomyFeedbackRequest é o payload enviado ao loop Wilson para feedback de um nó.
export interface TaxonomyFeedbackRequest {
  node_id: number
  action: 'approve' | 'reject' | 'reassign'
  target_parent_id?: number
  reason?: string
}

// TaxonomyFeedbackResponse descreve o retorno do endpoint de feedback.
export interface TaxonomyFeedbackResponse {
  ok: boolean
  message?: string
}

// fetchTaxonomyTree busca a árvore completa de taxonomia.
// Retorna array vazio se o endpoint retornar 404 (feature não habilitada).
export async function fetchTaxonomyTree(): Promise<TaxonomyNode[]> {
  const r = await authFetch('/api/admin/taxonomy/tree')
  if (r.status === 404) {
    return []
  }
  if (!r.ok) {
    throw new Error(`fetchTaxonomyTree ${r.status}`)
  }
  return r.json()
}

// postTaxonomyFeedback envia uma ação de feedback (approve/reject/reassign) para um nó.
// Retorna objeto com ok=false se o endpoint retornar 404 (feature não habilitada).
export async function postTaxonomyFeedback(
  req: TaxonomyFeedbackRequest,
): Promise<TaxonomyFeedbackResponse> {
  const r = await authFetch('/api/admin/taxonomy/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (r.status === 404) {
    return { ok: false, message: 'Endpoint não disponível' }
  }
  if (!r.ok) {
    throw new Error(`postTaxonomyFeedback ${r.status}`)
  }
  return r.json()
}
