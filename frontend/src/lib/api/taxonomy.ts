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
// Linha flat retornada pelo backend (GET /api/admin/taxonomy/tree). O backend
// devolve a lista plana; é o front que monta a hierarquia via parent_id.
interface TaxonomyNodeFlat {
  id: number
  parent_id: number | null
  slug: string
  name_pt: string
  kind: string
  confidence_pct?: number
}

export async function fetchTaxonomyTree(): Promise<TaxonomyNode[]> {
  const r = await authFetch('/api/admin/taxonomy/tree')
  if (r.status === 404) {
    return []
  }
  if (!r.ok) {
    throw new Error(`fetchTaxonomyTree ${r.status}`)
  }
  const flat = (await r.json()) as TaxonomyNodeFlat[]
  if (!Array.isArray(flat)) return []
  return buildTaxonomyTree(flat)
}

// buildTaxonomyTree converte a lista plana (com parent_id) na árvore aninhada que
// a UI espera: mapeia name_pt→name (fallback slug) e SEMPRE inicializa children=[].
function buildTaxonomyTree(flat: TaxonomyNodeFlat[]): TaxonomyNode[] {
  const byId = new Map<number, TaxonomyNode>()
  for (const row of flat) {
    byId.set(row.id, {
      id: row.id,
      name: row.name_pt || row.slug,
      kind: row.kind as TaxonomyNodeKind,
      parent_id: row.parent_id ?? null,
      children: [],
    })
  }
  const roots: TaxonomyNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id != null ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
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
