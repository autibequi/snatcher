import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  PageHeader,
  Switch,
  Tabs,
  Textarea,
} from '../components/ui'
import { apiClient } from '../lib/apiClient'
import {
  pageContainer,
  tableContainer,
  tableHeaderCell,
  tableRow,
  tableCell,
  tableCellMuted,
  formGroup,
  formHint,
} from '../lib/uiTokens'

// ── Types ────────────────────────────────────────────────────────────────────

interface TaxonomyEntry {
  id: number
  type: 'category' | 'brand'
  name: string
  slug: string
  keywords: string[]
  detect_count: number
  last_detected_at?: string | null
  active: boolean
  status: 'approved' | 'pending' | 'rejected'
  source: 'manual' | 'crawler' | 'llm'
  sample_text?: { String: string; Valid: boolean }
  created_at: string
}

interface TaxonomyPattern {
  id: number
  taxonomy_id: number
  kind: 'word_boundary' | 'regex' | 'exclude_regex'
  value: string
  weight: number
  active: boolean
  source: 'manual' | 'llm' | 'crawler'
  created_at: string
}

type TabKey = 'category' | 'brand' | 'pending' | 'patterns'

const TABS = [
  { id: 'category', label: 'Categorias' },
  { id: 'brand', label: 'Marcas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'patterns', label: 'Patterns' },
]

// ── KeywordsTab — categoria_keywords / brand_keywords ────────────────────────

function KeywordsTab({ type, search, onSearch, isLoading, items, onDelete, onAdd }: {
  type: 'category' | 'brand'
  search: string
  onSearch: (v: string) => void
  isLoading: boolean
  items: Record<string, unknown>[]
  onDelete: (id: number) => void
  onAdd: (slug: string, pattern: string, display?: string) => void
}) {
  const [newSlug, setNewSlug] = useState('')
  const [newPattern, setNewPattern] = useState('')
  const [newDisplay, setNewDisplay] = useState('')

  // Agrupar por slug
  const grouped: Record<string, Record<string, unknown>[]> = {}
  for (const item of items) {
    const key = String(type === 'category' ? item.category_slug : item.brand_slug)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(item)
  }

  return (
    <div className="space-y-4">
      <Input placeholder="Buscar..." value={search} onChange={e => onSearch(e.target.value)} />

      {isLoading ? <p className="text-sm text-fg-3">Carregando...</p>
        : items.length === 0 ? (
          <EmptyState title="Nenhum keyword cadastrado"
            description="As keywords são usadas para classificar produtos automaticamente." />
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([slug, kws]) => (
              <div key={slug} className={tableContainer}>
                <div className="px-3 py-2 bg-surface-2 border-b border-border flex items-center gap-2">
                  <span className="font-medium text-sm">{slug}</span>
                  {type === 'brand' && kws[0] && (
                    <span className="text-xs text-fg-3">({String((kws[0] as Record<string, unknown>).brand_display)})</span>
                  )}
                  <span className="text-xs text-fg-3 ml-auto">{kws.length} patterns</span>
                </div>
                <div className="flex flex-wrap gap-1.5 px-3 py-2">
                  {kws.map(kw => (
                    <span key={String(kw.id)} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-2 border border-border">
                      <code>{String(kw.pattern)}</code>
                      <button onClick={() => onDelete(Number(kw.id))} className="text-fg-4 hover:text-danger ml-0.5">✕</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Adicionar nova keyword */}
      <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
        <p className="text-xs font-medium text-fg-3 uppercase tracking-wide">Adicionar keyword</p>
        <div className="flex gap-2 flex-wrap">
          <input value={newSlug} onChange={e => setNewSlug(e.target.value)}
            placeholder={type === 'category' ? 'Slug (ex: tenis)' : 'Brand slug (ex: nike)'}
            className="text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent flex-1 min-w-0" />
          {type === 'brand' && (
            <input value={newDisplay} onChange={e => setNewDisplay(e.target.value)}
              placeholder="Nome exibição (ex: Nike)"
              className="text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent w-40" />
          )}
          <input value={newPattern} onChange={e => setNewPattern(e.target.value)}
            placeholder="Pattern ILIKE (ex: %nike%)"
            className="text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent flex-1 min-w-0" />
          <button
            onClick={() => { if (newSlug && newPattern) { onAdd(newSlug, newPattern, newDisplay); setNewSlug(''); setNewPattern(''); setNewDisplay('') } }}
            disabled={!newSlug || !newPattern}
            className="text-xs px-3 py-1 rounded bg-accent text-white disabled:opacity-50 shrink-0"
          >Adicionar</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Taxonomy() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('category')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaxonomyId, setSelectedTaxonomyId] = useState<number | null>(null)

  const queryKey =
    tab === 'pending'
      ? ['taxonomy', 'pending']
      : tab === 'patterns'
        ? ['patterns', selectedTaxonomyId]
        : tab === 'category'
          ? ['category-keywords']
          : tab === 'brand'
            ? ['brand-keywords']
            : ['taxonomy', tab]

  const url =
    tab === 'pending'
      ? '/api/taxonomy/pending'
      : tab === 'patterns'
        ? `/api/taxonomy/patterns?taxonomy_id=${selectedTaxonomyId}`
        : tab === 'category'
          ? '/api/admin/category-keywords'
          : tab === 'brand'
            ? '/api/admin/brand-keywords'
            : `/api/taxonomy?type=${tab}`

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey,
    queryFn: () => apiClient.get(url).then(r => (Array.isArray(r.data) ? r.data : [])),
    enabled: tab !== 'patterns' || selectedTaxonomyId !== null,
  })

  // Para category/brand keywords, campo de busca usa category_slug/brand_slug
  const filtered = items.filter(i => {
    if (!search) return true
    const text = (i.name ?? i.category_slug ?? i.brand_slug ?? i.brand_display ?? '').toLowerCase()
    return text.includes(search.toLowerCase()) || (i.pattern ?? '').toLowerCase().includes(search.toLowerCase())
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/taxonomy/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy'] }),
  })

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/taxonomy/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/taxonomy/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taxonomy'] }),
  })

  const deletePatternMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/taxonomy/patterns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patterns'] }),
  })

  function handleTabChange(id: string) {
    setTab(id as TabKey)
    if (id !== 'patterns') setSelectedTaxonomyId(null)
    setSearch('')
    setEditingId(null)
  }

  const showAddButton = tab !== 'patterns' || selectedTaxonomyId !== null

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Taxonomia"
        subtitle="Categorias, marcas e patterns de deteccao de produtos."
        className="mb-6"
        actions={
          showAddButton ? (
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              Adicionar termo
            </Button>
          ) : undefined
        }
      />

      <Tabs
        tabs={TABS}
        active={tab}
        onChange={handleTabChange}
        className="mb-4"
      />

      {tab === 'patterns' ? (
        <PatternsTab
          selectedTaxonomyId={selectedTaxonomyId}
          onSelect={setSelectedTaxonomyId}
          items={items as TaxonomyPattern[]}
          isLoading={isLoading}
          onDelete={id => {
            if (confirm('Excluir este pattern?')) deletePatternMut.mutate(id)
          }}
          onAdd={() => setShowCreate(true)}
        />
      ) : tab === 'category' || tab === 'brand' ? (
        <KeywordsTab
          type={tab}
          search={search}
          onSearch={setSearch}
          isLoading={isLoading}
          items={filtered}
          onDelete={id => {
            const endpoint = tab === 'category' ? 'category-keywords' : 'brand-keywords'
            if (confirm('Remover keyword?')) apiClient.delete(`/api/admin/${endpoint}/${id}`)
              .then(() => qc.invalidateQueries({ queryKey: tab === 'category' ? ['category-keywords'] : ['brand-keywords'] }))
          }}
          onAdd={(slug, pattern, display) => {
            const endpoint = tab === 'category' ? 'category-keywords' : 'brand-keywords'
            const body = tab === 'category'
              ? { category_slug: slug, pattern }
              : { brand_slug: slug, brand_display: display || slug, pattern }
            apiClient.post(`/api/admin/${endpoint}`, body)
              .then(() => qc.invalidateQueries({ queryKey: tab === 'category' ? ['category-keywords'] : ['brand-keywords'] }))
          }}
        />
      ) : (
        <TaxonomyTab
          tab={tab}
          search={search}
          onSearch={setSearch}
          isLoading={isLoading}
          filtered={filtered as TaxonomyEntry[]}
          editingId={editingId}
          onEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null)
            qc.invalidateQueries({ queryKey: ['taxonomy'] })
          }}
          onApprove={id => approveMut.mutate(id)}
          onReject={id => rejectMut.mutate(id)}
          onDelete={id => {
            if (confirm('Excluir este item?')) deleteMut.mutate(id)
          }}
        />
      )}

      {/* Create taxonomy term modal */}
      <CreateModal
        open={showCreate && tab !== 'patterns'}
        defaultType={tab === 'pending' ? 'category' : (tab as 'category' | 'brand')}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          qc.invalidateQueries({ queryKey: ['taxonomy'] })
        }}
      />

      {/* Create pattern modal */}
      {selectedTaxonomyId && (
        <CreatePatternModal
          open={showCreate && tab === 'patterns'}
          taxonomyId={selectedTaxonomyId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['patterns', selectedTaxonomyId] })
          }}
        />
      )}
    </div>
  )
}

// ── Patterns tab ──────────────────────────────────────────────────────────────

function PatternsTab({
  selectedTaxonomyId,
  onSelect,
  items,
  isLoading,
  onDelete,
  onAdd,
}: {
  selectedTaxonomyId: number | null
  onSelect: (id: number) => void
  items: TaxonomyPattern[]
  isLoading: boolean
  onDelete: (id: number) => void
  onAdd: () => void
}) {
  return (
    <>
      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <FieldLabel>Selecione uma taxonomia</FieldLabel>
          <TaxonomySelector selectedId={selectedTaxonomyId} onSelect={onSelect} />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onAdd}
          disabled={selectedTaxonomyId === null}
        >
          Adicionar pattern
        </Button>
      </div>

      {selectedTaxonomyId === null ? (
        <EmptyState
          title="Selecione uma taxonomia"
          description="Escolha uma taxonomia acima para ver e gerenciar seus patterns."
        />
      ) : isLoading ? (
        <p className="text-sm text-fg-3">Carregando patterns...</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum pattern definido"
          description="Adicione patterns de deteccao para esta taxonomia."
          cta={{ label: 'Adicionar pattern', onClick: onAdd }}
        />
      ) : (
        <div className={tableContainer}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className={tableHeaderCell}>Tipo</th>
                <th className={tableHeaderCell}>Valor</th>
                <th className={`${tableHeaderCell} text-right`}>Peso</th>
                <th className={tableHeaderCell}>Status</th>
                <th className={tableHeaderCell}>Origem</th>
                <th className={`${tableHeaderCell} text-right w-28`}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {items.map(pattern => (
                <tr key={pattern.id} className={tableRow}>
                  <td className={`${tableCell} font-mono text-xs`}>{pattern.kind}</td>
                  <td className={`${tableCellMuted} font-mono text-xs break-all max-w-xs`}>
                    {pattern.value}
                  </td>
                  <td className={`${tableCell} text-right font-mono`}>
                    {pattern.weight.toFixed(2)}
                  </td>
                  <td className={tableCell}>
                    <Badge variant={pattern.active ? 'default' : 'outline'} size="sm">
                      {pattern.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className={tableCell}>
                    <Badge
                      variant={pattern.source === 'manual' ? 'default' : 'warning'}
                      size="sm"
                    >
                      {pattern.source}
                    </Badge>
                  </td>
                  <td className={`${tableCell} text-right`}>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => alert('TODO: Editar pattern')}
                        className="text-xs px-2 py-1 rounded text-fg-2 hover:bg-surface-2"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDelete(pattern.id)}
                        className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Taxonomy tab ──────────────────────────────────────────────────────────────

function TaxonomyTab({
  tab,
  search,
  onSearch,
  isLoading,
  filtered,
  editingId,
  onEdit,
  onCancelEdit,
  onSaved,
  onApprove,
  onReject,
  onDelete,
}: {
  tab: TabKey
  search: string
  onSearch: (v: string) => void
  isLoading: boolean
  filtered: TaxonomyEntry[]
  editingId: number | null
  onEdit: (id: number) => void
  onCancelEdit: () => void
  onSaved: () => void
  onApprove: (id: number) => void
  onReject: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <>
      <div className="mb-3">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-fg-3">Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tab === 'pending' ? 'Nenhuma sugestao pendente' : 'Nenhum item encontrado'}
          description={search ? 'Tente outro termo de busca.' : undefined}
        />
      ) : (
        <div className={tableContainer}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className={tableHeaderCell}>Nome</th>
                <th className={`${tableHeaderCell} hidden sm:table-cell`}>Keywords</th>
                <th className={`${tableHeaderCell} text-right hidden sm:table-cell`}>
                  Deteccoes
                </th>
                <th className={tableHeaderCell}>Origem</th>
                <th className={`${tableHeaderCell} text-right w-28`}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item =>
                editingId === item.id ? (
                  <EditRow
                    key={item.id}
                    item={item}
                    onCancel={onCancelEdit}
                    onSaved={onSaved}
                  />
                ) : (
                  <tr key={item.id} className={tableRow}>
                    <td className={`${tableCell} font-medium`}>{item.name}</td>
                    <td className={`${tableCellMuted} hidden sm:table-cell`}>
                      <div className="flex flex-wrap gap-1">
                        {item.keywords.slice(0, 5).map((k: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 bg-surface-2 rounded border border-border"
                          >
                            {k}
                          </span>
                        ))}
                        {item.keywords.length > 5 && (
                          <span className="text-xs text-fg-3">+{item.keywords.length - 5}</span>
                        )}
                      </div>
                    </td>
                    <td className={`${tableCell} text-right font-mono hidden sm:table-cell`}>
                      {item.detect_count}
                    </td>
                    <td className={tableCell}>
                      <Badge
                        variant={item.source === 'manual' ? 'default' : 'warning'}
                        size="sm"
                      >
                        {item.source}
                      </Badge>
                    </td>
                    <td className={`${tableCell} text-right`}>
                      <div className="flex justify-end gap-1">
                        {tab === 'pending' ? (
                          <>
                            <button
                              onClick={() => onApprove(item.id)}
                              className="text-xs px-2 py-1 rounded text-success hover:bg-success/10"
                            >
                              Aprovar
                            </button>
                            <button
                              onClick={() => onReject(item.id)}
                              className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
                            >
                              Rejeitar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => onEdit(item.id)}
                              className="text-xs px-2 py-1 rounded text-fg-2 hover:bg-surface-2"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => onDelete(item.id)}
                              className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Inline edit row ───────────────────────────────────────────────────────────

function EditRow({
  item,
  onCancel,
  onSaved,
}: {
  item: TaxonomyEntry
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(item.name)
  const [keywords, setKeywords] = useState(item.keywords.join(', '))
  const [active, setActive] = useState(item.active)

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/taxonomy/${item.id}`, {
        name,
        keywords: keywords
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        active,
      }),
    onSuccess: onSaved,
  })

  return (
    <tr className="border-b border-border bg-accent/5">
      <td className="px-4 py-2">
        <input
          className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </td>
      <td className="px-4 py-2 hidden sm:table-cell" colSpan={2}>
        <input
          className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg"
          placeholder="separe por virgula"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <Switch checked={active} onChange={setActive} label="ativo" />
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex justify-end gap-1">
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent/90"
          >
            Salvar
          </button>
          <button
            onClick={onCancel}
            className="text-xs px-2 py-1 rounded text-fg-2 hover:bg-surface-2"
          >
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Taxonomy selector ─────────────────────────────────────────────────────────

function TaxonomySelector({
  selectedId,
  onSelect,
}: {
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const { data: items = [] } = useQuery<TaxonomyEntry[]>({
    queryKey: ['taxonomy', 'all'],
    queryFn: () =>
      apiClient
        .get('/api/taxonomy?limit=1000')
        .then(r => (Array.isArray(r.data) ? r.data : [])),
  })

  return (
    <select
      value={selectedId ?? ''}
      onChange={e => onSelect(parseInt(e.target.value))}
      className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
    >
      <option value="">-- Selecionar --</option>
      {items.map(item => (
        <option key={item.id} value={item.id}>
          [{item.type}] {item.name}
        </option>
      ))}
    </select>
  )
}

// ── Create pattern modal ──────────────────────────────────────────────────────

function CreatePatternModal({
  open,
  taxonomyId,
  onClose,
  onCreated,
}: {
  open: boolean
  taxonomyId: number
  onClose: () => void
  onCreated: () => void
}) {
  const [kind, setKind] = useState<'word_boundary' | 'regex' | 'exclude_regex'>('word_boundary')
  const [value, setValue] = useState('')
  const [weight, setWeight] = useState(1.0)

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/taxonomy/patterns', {
        taxonomy_id: taxonomyId,
        kind,
        value,
        weight,
        active: true,
      }),
    onSuccess: () => {
      setValue('')
      setWeight(1.0)
      setKind('word_boundary')
      onCreated()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao criar pattern'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar Pattern"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => createMut.mutate()}
            loading={createMut.isPending}
            disabled={!value.trim()}
          >
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={formGroup}>
          <FieldLabel>Tipo</FieldLabel>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as typeof kind)}
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
          >
            <option value="word_boundary">Word Boundary</option>
            <option value="regex">Regex</option>
            <option value="exclude_regex">Exclude Regex</option>
          </select>
          <p className={formHint}>
            {kind === 'word_boundary' && 'Match literal com boundary check'}
            {kind === 'regex' && 'Pattern regex livre'}
            {kind === 'exclude_regex' && 'Exclui produtos que atendem este regex'}
          </p>
        </div>

        <div className={formGroup}>
          <FieldLabel>Valor</FieldLabel>
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={kind === 'regex' ? '^\\d+x.*' : 'iPhone'}
            className="font-mono"
          />
        </div>

        <div className={formGroup}>
          <FieldLabel>Peso</FieldLabel>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={weight}
            onChange={e => setWeight(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Create taxonomy modal ─────────────────────────────────────────────────────

function CreateModal({
  open,
  defaultType,
  onClose,
  onCreated,
}: {
  open: boolean
  defaultType: 'category' | 'brand'
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<'category' | 'brand'>(defaultType)
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/taxonomy', {
        type,
        name,
        keywords: keywords
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        active: true,
      }),
    onSuccess: () => {
      setName('')
      setKeywords('')
      onCreated()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao criar'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar termo"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => createMut.mutate()}
            loading={createMut.isPending}
            disabled={!name.trim()}
          >
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={formGroup}>
          <FieldLabel>Tipo</FieldLabel>
          <select
            value={type}
            onChange={e => setType(e.target.value as 'category' | 'brand')}
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
          >
            <option value="category">Categoria</option>
            <option value="brand">Marca</option>
          </select>
        </div>

        <div className={formGroup}>
          <FieldLabel required>Nome</FieldLabel>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ex: Drones, Apple"
          />
        </div>

        <div className={formGroup}>
          <FieldLabel>Keywords (separe por virgula)</FieldLabel>
          <Textarea
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder="drone, dji, mavic, mini 4..."
            rows={3}
          />
          <p className={formHint}>
            O crawler usa essas keywords para detectar produtos desta categoria/marca.
          </p>
        </div>
      </div>
    </Modal>
  )
}
