import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch, authFetchJSON } from '../lib/authFetch'
import { sectionCard, pageContainer } from '../lib/uiTokens'
import { PageHeader } from '../components/ui/PageHeader'

interface Category {
  id: number
  slug: string
  name: string
}

interface Template {
  id: number
  category_id: number
  category_slug: string
  body: string
  weight: number
  enabled: boolean
  sentiment_target?: string
  created_at: string
}

const VARS = ['{titulo}', '{preco_de}', '{preco_por}', '{desconto}', '{link}', '{emoji}']

const EMPTY: Omit<Template, 'id' | 'created_at' | 'category_slug'> = {
  category_id: 0,
  body: '',
  weight: 1,
  enabled: true,
  sentiment_target: '',
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        value ? 'bg-success' : 'bg-surface-3',
      ].join(' ')}
      aria-label={value ? 'Desativar' : 'Ativar'}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform',
          value ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

function VarBadge({ label }: { label: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-mono mr-1 mb-1">
      {label}
    </span>
  )
}

function Preview({ body }: { body: string }) {
  if (!body) return null
  const sample: Record<string, string> = {
    '{titulo}': 'Headphone JBL Tune 510BT',
    '{preco_de}': '299,90',
    '{preco_por}': '179,90',
    '{desconto}': '40',
    '{link}': 'https://sntchr.io/abc123',
    '{emoji}': '🎧',
  }
  const rendered = body.replace(
    /\{[a-z_]+\}/g,
    (m) => sample[m] ?? m,
  )
  return (
    <div className="mt-2 rounded bg-success/10 border border-success/20 p-3">
      <p className="text-xs text-success font-medium mb-1">Preview com valores de exemplo:</p>
      <pre className="text-sm text-fg whitespace-pre-wrap font-sans">{rendered}</pre>
    </div>
  )
}

interface FormProps {
  categories: Category[]
  initial: Omit<Template, 'id' | 'created_at' | 'category_slug'>
  onSave: (data: Omit<Template, 'id' | 'created_at' | 'category_slug'>) => void
  onCancel: () => void
  loading?: boolean
}

function TemplateForm({ categories, initial, onSave, onCancel, loading }: FormProps) {
  const [form, setForm] = useState(initial)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text mb-1">Categoria</label>
        <select
          className="w-full border border-border rounded px-3 py-2 text-sm bg-bg"
          value={form.category_id}
          onChange={(e) => set('category_id', Number(e.target.value))}
        >
          <option value={0}>Selecione...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.slug})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1">Corpo da mensagem</label>
        <div className="mb-1 flex flex-wrap">
          {VARS.map((v) => (
            <VarBadge key={v} label={v} />
          ))}
        </div>
        <textarea
          className="w-full border border-border rounded px-3 py-2 text-sm font-mono bg-bg resize-y"
          rows={6}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder={'🔥 {titulo}\nDe R$ {preco_de} por R$ {preco_por} ({desconto}% OFF)\n{link}'}
        />
        <Preview body={form.body} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Peso (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            className="w-full border border-border rounded px-3 py-2 text-sm bg-bg"
            value={form.weight}
            onChange={(e) => set('weight', Math.max(1, Math.min(5, Number(e.target.value))))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Sentimento alvo</label>
          <input
            type="text"
            className="w-full border border-border rounded px-3 py-2 text-sm bg-bg"
            value={form.sentiment_target ?? ''}
            onChange={(e) => set('sentiment_target', e.target.value || undefined)}
            placeholder="ex: urgência, curiosidade..."
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Toggle value={form.enabled} onChange={() => set('enabled', !form.enabled)} />
        <span className="text-sm text-text-secondary">{form.enabled ? 'Ativo' : 'Inativo'}</span>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(form)}
          disabled={loading || form.category_id === 0 || !form.body.trim()}
          className="px-4 py-2 rounded bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded border border-border text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function AdminTemplates() {
  const qc = useQueryClient()
  const [filterCat, setFilterCat] = useState<string>('todas')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['templates-categories'],
    queryFn: () => authFetchJSON<Category[]>('/api/admin/templates/categories', []),
  })

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => authFetchJSON<Template[]>('/api/admin/templates', []),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['templates'] })

  const createMut = useMutation({
    mutationFn: (body: Omit<Template, 'id' | 'created_at' | 'category_slug'>) =>
      authFetch('/api/admin/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => { invalidate(); setCreating(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: Omit<Template, 'created_at' | 'category_slug'>) =>
      authFetch(`/api/admin/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => { invalidate(); setEditing(null) },
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/admin/templates/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/admin/templates/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const filtered = filterCat === 'todas'
    ? templates
    : templates.filter((t) => t.category_slug === filterCat)

  const slugs = [...new Set(templates.map((t) => t.category_slug))].sort()

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Templates de Mensagem"
        subtitle={`${templates.length} template${templates.length !== 1 ? 's' : ''} cadastrado${templates.length !== 1 ? 's' : ''}`}
        actions={
          <button
            onClick={() => { setCreating(true); setEditing(null) }}
            className="px-4 py-2 rounded bg-primary text-white text-sm font-medium"
          >
            + Novo template
          </button>
        }
        className="mb-6"
      />

      {creating && (
        <div className={`${sectionCard} mb-6`}>
          <h2 className="text-base font-medium text-text mb-4">Novo template</h2>
          <TemplateForm
            categories={categories}
            initial={{ ...EMPTY }}
            onSave={(data) => createMut.mutate(data)}
            onCancel={() => setCreating(false)}
            loading={createMut.isPending}
          />
        </div>
      )}

      {/* Filtro por categoria */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['todas', ...slugs].map((s) => (
          <button
            key={s}
            onClick={() => setFilterCat(s)}
            className={[
              'px-3 py-1 rounded-full text-sm border transition-colors',
              filterCat === s
                ? 'bg-primary text-white border-primary'
                : 'border-border text-text-secondary hover:border-primary',
            ].join(' ')}
          >
            {s === 'todas' ? `Todas (${templates.length})` : `${s} (${templates.filter((t) => t.category_slug === s).length})`}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-12 text-text-secondary text-sm">Carregando...</div>
      )}

      <div className="space-y-3">
        {filtered.map((t) => (
          <div key={t.id} className={sectionCard}>
            {editing?.id === t.id ? (
              <>
                <h3 className="text-sm font-medium text-text mb-3">Editar template #{t.id}</h3>
                <TemplateForm
                  categories={categories}
                  initial={{
                    category_id: t.category_id,
                    body: t.body,
                    weight: t.weight,
                    enabled: t.enabled,
                    sentiment_target: t.sentiment_target,
                  }}
                  onSave={(data) => updateMut.mutate({ id: t.id, ...data })}
                  onCancel={() => setEditing(null)}
                  loading={updateMut.isPending}
                />
              </>
            ) : (
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary">
                      #{t.id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {t.category_slug}
                    </span>
                    <span className="text-xs text-text-secondary">peso {t.weight}</span>
                    {t.sentiment_target && (
                      <span className="text-xs text-text-secondary italic">{t.sentiment_target}</span>
                    )}
                  </div>
                  <pre className="text-sm text-text whitespace-pre-wrap font-sans leading-snug">
                    {t.body}
                  </pre>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <Toggle
                    value={t.enabled}
                    onChange={() => toggleMut.mutate(t.id)}
                  />
                  <button
                    onClick={() => { setEditing(t); setCreating(false) }}
                    className="text-xs text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir template #${t.id}?`)) deleteMut.mutate(t.id)
                    }}
                    className="text-xs text-danger hover:underline"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-text-secondary text-sm">
            Nenhum template encontrado.
          </div>
        )}
      </div>
    </div>
  )
}
