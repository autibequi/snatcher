import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Badge, TutorialHelpButton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

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

export default function Taxonomy() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('category')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaxonomyId, setSelectedTaxonomyId] = useState<number | null>(null)

  const queryKey = tab === 'pending' ? ['taxonomy', 'pending'] : tab === 'patterns' ? ['patterns', selectedTaxonomyId] : ['taxonomy', tab]
  const url = tab === 'pending' ? '/api/taxonomy/pending' : tab === 'patterns' ? `/api/taxonomy/patterns?taxonomy_id=${selectedTaxonomyId}` : `/api/taxonomy?type=${tab}`

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey,
    queryFn: () => apiClient.get(url).then(r => (Array.isArray(r.data) ? r.data : [])),
    enabled: tab !== 'patterns' || selectedTaxonomyId !== null,
  })

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  )

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

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-semibold text-fg">Taxonomia</h1>
          <TutorialHelpButton />
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + Adicionar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(['category', 'brand', 'pending', 'patterns'] as TabKey[]).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              if (t !== 'patterns') setSelectedTaxonomyId(null)
            }}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-2 hover:text-fg'
            }`}
          >
            {t === 'category' ? 'Categorias' : t === 'brand' ? 'Marcas' : t === 'pending' ? 'Pendentes' : 'Patterns'}
          </button>
        ))}
      </div>

      {tab === 'patterns' ? (
        // ── Patterns Tab ───────────────────────────────────────────────────────
        <>
          <div className="mb-4 flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-fg-2 block mb-1">Selecione uma taxonomia</label>
              <TaxonomySelector
                selectedId={selectedTaxonomyId}
                onSelect={setSelectedTaxonomyId}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreate(true)}
              disabled={selectedTaxonomyId === null}
            >
              + Pattern
            </Button>
          </div>

          {selectedTaxonomyId === null ? (
            <p className="text-sm text-fg-3 py-4 text-center">Selecione uma taxonomia para ver seus patterns</p>
          ) : isLoading ? (
            <p className="text-sm text-fg-3">Carregando patterns...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-fg-3 py-4 text-center">Nenhum pattern definido.</p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 border-b border-border">
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Tipo</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Valor</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase">Peso</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Status</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Origem</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((pattern: TaxonomyPattern) => (
                    <tr key={pattern.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-2 font-mono text-xs text-fg">{pattern.kind}</td>
                      <td className="px-4 py-2 text-fg-2 font-mono text-xs break-all max-w-xs">{pattern.value}</td>
                      <td className="px-4 py-2 text-right font-mono text-fg-2">{pattern.weight.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={pattern.active ? 'default' : 'outline'}
                          size="sm"
                        >
                          {pattern.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={pattern.source === 'manual' ? 'default' : 'warning'} size="sm">
                          {pattern.source}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => alert('TODO: Editar pattern')}
                            className="text-xs px-2 py-1 rounded text-fg-2 hover:bg-surface-2"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Excluir este pattern?`)) deletePatternMut.mutate(pattern.id)
                            }}
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
      ) : (
        // ── Taxonomy Tab ───────────────────────────────────────────────────────
        <>
          <div className="mb-3">
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-fg-3">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-fg-3 py-4 text-center">
              {tab === 'pending' ? 'Nenhuma sugestão pendente.' : 'Nenhum item.'}
            </p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 border-b border-border">
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Nome</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Keywords</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase">Detecções</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase">Origem</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item =>
                    editingId === item.id ? (
                      <EditRow
                        key={item.id}
                        item={item}
                        onCancel={() => setEditingId(null)}
                        onSaved={() => {
                          setEditingId(null)
                          qc.invalidateQueries({ queryKey: ['taxonomy'] })
                        }}
                      />
                    ) : (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                        <td className="px-4 py-2 font-medium text-fg">{item.name}</td>
                        <td className="px-4 py-2 text-fg-2">
                          <div className="flex flex-wrap gap-1">
                            {item.keywords.slice(0, 5).map((k: string, i: number) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 bg-surface-2 rounded border border-border">
                                {k}
                              </span>
                            ))}
                            {item.keywords.length > 5 && (
                              <span className="text-xs text-fg-3">+{item.keywords.length - 5}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-fg-2">{item.detect_count}</td>
                        <td className="px-4 py-2">
                          <Badge variant={item.source === 'manual' ? 'default' : 'warning'} size="sm">
                            {item.source}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {tab === 'pending' ? (
                              <>
                                <button
                                  onClick={() => approveMut.mutate(item.id)}
                                  className="text-xs px-2 py-1 rounded text-success hover:bg-success/10"
                                >
                                  Aprovar
                                </button>
                                <button
                                  onClick={() => rejectMut.mutate(item.id)}
                                  className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
                                >
                                  Rejeitar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditingId(item.id)}
                                  className="text-xs px-2 py-1 rounded text-fg-2 hover:bg-surface-2"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Excluir "${item.name}"?`)) deleteMut.mutate(item.id)
                                  }}
                                  className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
                                >
                                  Excluir
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showCreate && tab !== 'patterns' && (
        <CreateModal
          defaultType={tab === 'pending' ? 'category' : tab}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['taxonomy'] })
          }}
        />
      )}

      {showCreate && tab === 'patterns' && selectedTaxonomyId && (
        <CreatePatternModal
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

// ── Inline edit row ─────────────────────────────────────────────────────────
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
        keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
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
      <td className="px-4 py-2" colSpan={2}>
        <input
          className="w-full text-sm border border-border rounded px-2 py-1 bg-surface text-fg"
          placeholder="separe por vírgula"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <label className="flex items-center gap-1 text-xs text-fg-2">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          ativo
        </label>
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

// ── Taxonomy Selector ──────────────────────────────────────────────────────
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
          {item.name}
        </option>
      ))}
    </select>
  )
}

// ── Create Pattern Modal ────────────────────────────────────────────────────
function CreatePatternModal({
  taxonomyId,
  onClose,
  onCreated,
}: {
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
    onSuccess: onCreated,
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao criar pattern'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Adicionar Pattern</h2>
          <button onClick={onClose} className="text-fg-3 hover:text-fg text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Tipo</label>
            <select
              value={kind}
              onChange={e => setKind(e.target.value as any)}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
            >
              <option value="word_boundary">Word Boundary</option>
              <option value="regex">Regex</option>
              <option value="exclude_regex">Exclude Regex</option>
            </select>
            <p className="text-xs text-fg-3 mt-1">
              word_boundary: match literal com boundary check | regex: pattern regex | exclude_regex: exclui matches
            </p>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Valor</label>
            <input
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg font-mono"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={kind === 'regex' ? '^\\d+x.*' : 'iPhone'}
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Peso</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
              value={weight}
              onChange={e => setWeight(parseFloat(e.target.value))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => createMut.mutate()}
              loading={createMut.isPending}
              disabled={!value.trim()}
            >
              Criar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create modal ────────────────────────────────────────────────────────────
function CreateModal({
  defaultType,
  onClose,
  onCreated,
}: {
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
        keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
        active: true,
      }),
    onSuccess: onCreated,
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao criar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Adicionar entrada</h2>
          <button onClick={onClose} className="text-fg-3 hover:text-fg text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Tipo</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as any)}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
            >
              <option value="category">Categoria</option>
              <option value="brand">Marca</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Nome</label>
            <input
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Drones, Apple"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Keywords (separe por vírgula)</label>
            <textarea
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
              rows={3}
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="drone, dji, mavic, mini 4..."
            />
            <p className="text-xs text-fg-3 mt-1">
              O crawler usa essas keywords pra detectar produtos desta categoria/marca
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => createMut.mutate()}
              loading={createMut.isPending}
              disabled={!name.trim()}
            >
              Criar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
