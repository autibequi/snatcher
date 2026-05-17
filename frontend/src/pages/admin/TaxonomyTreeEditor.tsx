import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchTaxonomyTree,
  postTaxonomyFeedback,
  type TaxonomyNode,
  type TaxonomyNodeKind,
  type TaxonomyFeedbackRequest,
} from '../../lib/api/taxonomy'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { pageContainer, sectionCard, filterBar } from '../../lib/uiTokens'
import { mythosEmpty } from '../../lib/copy/mythos'

// KIND_LABELS mapeia os kinds para rótulos PT-BR exibidos nos filtros.
const KIND_LABELS: Record<TaxonomyNodeKind | 'all', string> = {
  all: 'Todos',
  brand: 'Marca',
  category: 'Categoria',
  subcategory: 'Subcategoria',
  attribute: 'Atributo',
}

const ALL_KINDS: (TaxonomyNodeKind | 'all')[] = [
  'all',
  'brand',
  'category',
  'subcategory',
  'attribute',
]

// kindBadgeVariant retorna a variante de Badge para cada tipo de nó.
function kindBadgeVariant(kind: TaxonomyNodeKind): 'accent' | 'default' | 'warning' | 'success' {
  const map: Record<TaxonomyNodeKind, 'accent' | 'default' | 'warning' | 'success'> = {
    brand: 'accent',
    category: 'success',
    subcategory: 'default',
    attribute: 'warning',
  }
  return map[kind]
}

// filterNodesByKind filtra a árvore mantendo apenas nós do kind especificado (recursivo).
function filterNodesByKind(
  nodes: TaxonomyNode[],
  kind: TaxonomyNodeKind | 'all',
): TaxonomyNode[] {
  if (kind === 'all') {
    return nodes
  }
  return nodes
    .map((node) => ({
      ...node,
      children: filterNodesByKind(node.children, kind),
    }))
    .filter((node) => node.kind === kind || node.children.length > 0)
}

// TaxonomyNodeRow exibe um nó com indentação recursiva e botão de seleção.
function TaxonomyNodeRow({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TaxonomyNode
  depth: number
  selectedId: number | null
  onSelect: (node: TaxonomyNode) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const hasChildren = node.children.length > 0

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-surface-2 transition-colors ${selectedId === node.id ? 'bg-accent-soft/60' : ''}`}
        onClick={() => onSelect(node)}
      >
        {hasChildren && (
          <button
            className="text-fg-3 w-4 text-xs shrink-0 hover:text-fg"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((prev) => !prev)
            }}
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        {!hasChildren && <span className="w-4 shrink-0" />}
        <span className="text-sm text-fg flex-1 min-w-0 truncate">{node.name}</span>
        <Badge variant={kindBadgeVariant(node.kind)} size="sm">
          {KIND_LABELS[node.kind]}
        </Badge>
      </div>
      {open &&
        hasChildren &&
        node.children.map((child) => (
          <TaxonomyNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}

// FeedbackPanel exibe o painel lateral de ações Wilson para o nó selecionado.
function FeedbackPanel({
  node,
  onClose,
}: {
  node: TaxonomyNode
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')

  // mutation envia a ação de feedback ao backend
  const mutation = useMutation({
    mutationFn: (req: TaxonomyFeedbackRequest) => postTaxonomyFeedback(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxonomy', 'tree'] })
      onClose()
    },
  })

  function sendAction(action: 'approve' | 'reject' | 'reassign') {
    mutation.mutate({
      node_id: node.id,
      action,
      reason: reason || undefined,
    })
  }

  return (
    <div className={`${sectionCard} space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Feedback — {node.name}</h3>
        <button className="text-fg-3 hover:text-fg text-xs" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant={kindBadgeVariant(node.kind)} size="sm">
          {KIND_LABELS[node.kind]}
        </Badge>
        <span className="text-xs text-fg-3">ID: {node.id}</span>
        {node.parent_id !== null && (
          <span className="text-xs text-fg-3">Parent: {node.parent_id}</span>
        )}
      </div>
      <textarea
        className="w-full text-sm bg-bg border border-border rounded px-2 py-1.5 text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        rows={2}
        placeholder="Motivo (opcional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {mutation.isError && (
        <p className="text-xs text-danger">Erro ao enviar feedback. Tente novamente.</p>
      )}
      {!mutation.data?.ok && mutation.data?.message && (
        <p className="text-xs text-fg-3">{mutation.data.message}</p>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="primary"
          size="sm"
          loading={mutation.isPending}
          onClick={() => sendAction('approve')}
        >
          Aprovar
        </Button>
        <Button
          variant="danger"
          size="sm"
          loading={mutation.isPending}
          onClick={() => sendAction('reject')}
        >
          Rejeitar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={mutation.isPending}
          onClick={() => sendAction('reassign')}
        >
          Reclassificar
        </Button>
      </div>
    </div>
  )
}

// TaxonomyTreeEditor é a tela admin de visualização e feedback da árvore de taxonomia.
export default function TaxonomyTreeEditor() {
  const [kindFilter, setKindFilter] = useState<TaxonomyNodeKind | 'all'>('all')
  const [selectedNode, setSelectedNode] = useState<TaxonomyNode | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['taxonomy', 'tree'],
    queryFn: fetchTaxonomyTree,
  })

  function renderTree() {
    if (isLoading) {
      return <Skeleton variant="table" rows={6} />
    }

    if (isError) {
      return (
        <EmptyState
          title="Erro ao carregar taxonomia"
          description="O endpoint retornou um erro. Verifique o backend."
        />
      )
    }

    if (!data || data.length === 0) {
      return (
        <EmptyState
          title="Árvore de taxonomia vazia"
          description={mythosEmpty.taxonomy}
        />
      )
    }

    const filtered = filterNodesByKind(data, kindFilter)

    if (filtered.length === 0) {
      return (
        <EmptyState
          title="Nenhum nó com esse filtro"
          description={`Não há nós do tipo "${KIND_LABELS[kindFilter]}" na árvore.`}
        />
      )
    }

    return (
      <div className="overflow-y-auto max-h-[60vh] rounded border border-border bg-surface p-2">
        {filtered.map((node) => (
          <TaxonomyNodeRow
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedNode?.id ?? null}
            onSelect={setSelectedNode}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={pageContainer}>
      <PageHeader title="Árvore de Taxonomia" className="mb-4" />

      {/* Filtro por kind */}
      <div className={`${filterBar} mb-4 rounded`}>
        {ALL_KINDS.map((kind) => (
          <button
            key={kind}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium ${kindFilter === kind ? 'bg-accent text-bg' : 'bg-surface-2 text-fg-2 hover:bg-surface-3'}`}
            onClick={() => setKindFilter(kind)}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Árvore */}
        <div className="lg:col-span-2">{renderTree()}</div>

        {/* Painel lateral de feedback */}
        <div>
          {selectedNode ? (
            <FeedbackPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          ) : (
            <div className={`${sectionCard} text-center`}>
              <p className="text-sm text-fg-3">
                Selecione um nó na árvore para ver opções de feedback.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
