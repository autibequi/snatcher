import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui'
import { apiClient } from '../lib/apiClient'
import TagInput from './TagInput'

// Pesos default do scoring — refletir do backend (match/score.go defaultWeights)
const DEFAULT_WEIGHTS = {
  category: 30,
  brand: 20,
  drop: 20,
  price: 15,
  history: 15,
}

interface ScoringForm {
  categories: string[]
  brands: string[]
  min_drop: string
  min_price: string
  max_price: string
  gender: string
  // Pesos em pontos (0-100)
  w_category: number
  w_brand: number
  w_drop: number
  w_price: number
  w_history: number
}

// ── Editor de pontuação do canal ─────────────────────────────────────────────
export default function AudienceEditor({ channelId, audience }: { channelId: string; audience: any }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<ScoringForm>({
    categories: [],
    brands: [],
    min_drop: '',
    min_price: '',
    max_price: '',
    gender: '',
    w_category: DEFAULT_WEIGHTS.category,
    w_brand: DEFAULT_WEIGHTS.brand,
    w_drop: DEFAULT_WEIGHTS.drop,
    w_price: DEFAULT_WEIGHTS.price,
    w_history: DEFAULT_WEIGHTS.history,
  })
  const [saved, setSaved] = React.useState(false)

  // Sincronizar com dados do servidor
  React.useEffect(() => {
    if (!audience) return
    const w = audience.weights ?? {}
    const sum = (w.category ?? 0) + (w.brand ?? 0) + (w.drop ?? 0) + (w.price ?? 0) + (w.history ?? 0)
    // Se backend tem pesos definidos, converte de [0..1] para [0..100] em pontos.
    // Se não tem (sum == 0), usa defaults.
    const usingCustom = sum > 0
    setForm({
      categories: audience.categories ?? [],
      brands: audience.brands ?? [],
      min_drop: audience.min_drop ? String(audience.min_drop) : '',
      min_price: audience.min_price ? String(audience.min_price) : '',
      max_price: audience.max_price ? String(audience.max_price) : '',
      gender: audience.gender ?? '',
      w_category: usingCustom ? Math.round((w.category ?? 0) * 100) : DEFAULT_WEIGHTS.category,
      w_brand:    usingCustom ? Math.round((w.brand    ?? 0) * 100) : DEFAULT_WEIGHTS.brand,
      w_drop:     usingCustom ? Math.round((w.drop     ?? 0) * 100) : DEFAULT_WEIGHTS.drop,
      w_price:    usingCustom ? Math.round((w.price    ?? 0) * 100) : DEFAULT_WEIGHTS.price,
      w_history:  usingCustom ? Math.round((w.history  ?? 0) * 100) : DEFAULT_WEIGHTS.history,
    })
  }, [audience])

  const totalWeight = form.w_category + form.w_brand + form.w_drop + form.w_price + form.w_history
  const isUnbalanced = Math.abs(totalWeight - 100) > 1

  const saveMut = useMutation({
    mutationFn: () => {
      const newAudience = {
        categories: form.categories,
        brands: form.brands,
        min_drop: form.min_drop ? Number(form.min_drop) : 0,
        min_price: form.min_price ? Number(form.min_price) : 0,
        max_price: form.max_price ? Number(form.max_price) : 0,
        gender: form.gender || 'mix',
        locales: audience?.locales ?? [],
        age_range: audience?.age_range ?? [0, 99],
        weights: {
          category: form.w_category / 100,
          brand: form.w_brand / 100,
          drop: form.w_drop / 100,
          price: form.w_price / 100,
          history: form.w_history / 100,
        },
      }
      return apiClient.put(`/api/channels/${channelId}`, {
        ...audience,
        audience: newAudience,
      }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', channelId, 'audience'] })
      qc.invalidateQueries({ queryKey: ['channels', channelId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const setField = <K extends keyof ScoringForm>(key: K, val: ScoringForm[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const resetWeights = () => {
    setForm(f => ({
      ...f,
      w_category: DEFAULT_WEIGHTS.category,
      w_brand: DEFAULT_WEIGHTS.brand,
      w_drop: DEFAULT_WEIGHTS.drop,
      w_price: DEFAULT_WEIGHTS.price,
      w_history: DEFAULT_WEIGHTS.history,
    }))
  }

  const sliderRow = (
    label: string,
    weight: number,
    setter: (n: number) => void,
    description: string,
  ) => (
    <div className="bg-surface-2 rounded-md p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-fg">{label}</p>
        <span className={`text-xs font-mono px-2 py-0.5 rounded ${weight === 0 ? 'bg-surface text-fg-3' : 'bg-accent/10 text-accent'}`}>
          {weight}pts
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={weight}
        onChange={e => setter(Number(e.target.value))}
        className="w-full accent-accent"
      />
      <p className="text-xs text-fg-3 mt-1">{description}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-fg">Pontuação do canal</h3>
        <p className="text-xs text-fg-3 mt-0.5">
          Cada produto recebe um score de 0 a 100. Ajuste o peso de cada critério abaixo —
          a soma deve dar <strong>100</strong>.
        </p>
      </div>

      {/* ─── Critérios e seus filtros + pesos ─── */}
      <div className="space-y-3">
        {/* Categoria */}
        <div className="border border-border rounded-md p-3 space-y-2">
          {sliderRow(
            'Categorias preferidas',
            form.w_category,
            n => setField('w_category', n),
            'Produto cuja categoria/título contém uma destas palavras ganha pontos máximos neste critério.',
          )}
          <div>
            <TagInput
              type="category"
              value={form.categories}
              onChange={next => setForm(f => ({ ...f, categories: next }))}
              placeholder="suplementos, eletrônicos, beleza..."
            />
          </div>
        </div>

        {/* Marca */}
        <div className="border border-border rounded-md p-3 space-y-2">
          {sliderRow(
            'Marcas preferidas',
            form.w_brand,
            n => setField('w_brand', n),
            'Produto destas marcas pontua máximo neste critério. Sem marcas configuradas, usa um valor neutro.',
          )}
          <div>
            <TagInput
              type="brand"
              value={form.brands}
              onChange={next => setForm(f => ({ ...f, brands: next }))}
              placeholder="Apple, Samsung, Nike..."
            />
          </div>
        </div>

        {/* Drop */}
        <div className="border border-border rounded-md p-3 space-y-2">
          {sliderRow(
            'Desconto (drop %)',
            form.w_drop,
            n => setField('w_drop', n),
            'Quanto maior o desconto em relação ao mínimo configurado, mais ponto. Abaixo do mínimo, score é proporcional.',
          )}
          <div>
            <label className="text-xs text-fg-2 block mb-1">Drop mínimo (%)</label>
            <input
              type="number" min="0" max="100"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              placeholder="10"
              value={form.min_drop}
              onChange={e => setField('min_drop', e.target.value)}
            />
          </div>
        </div>

        {/* Preço */}
        <div className="border border-border rounded-md p-3 space-y-2">
          {sliderRow(
            'Faixa de preço',
            form.w_price,
            n => setField('w_price', n),
            'Produto dentro da faixa pontua 100%. Fora da faixa, perde pontos linearmente conforme distância dos limites.',
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-2 block mb-1">Preço mín (R$)</label>
              <input
                type="number" min="0"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                placeholder="0"
                value={form.min_price}
                onChange={e => setField('min_price', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Preço máx (R$)</label>
              <input
                type="number" min="0"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                placeholder="9999"
                value={form.max_price}
                onChange={e => setField('max_price', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Histórico */}
        <div className="border border-border rounded-md p-3">
          {sliderRow(
            'Histórico de performance',
            form.w_history,
            n => setField('w_history', n),
            'Score baseado em CTR/conversão de produtos similares neste canal. Hoje neutro (0.5) — usado quando há histórico.',
          )}
        </div>
      </div>

      {/* Soma dos pesos */}
      <div className={`rounded-md p-3 text-xs ${
        isUnbalanced
          ? 'bg-warning/10 border border-warning/40 text-warning'
          : 'bg-success/10 border border-success/30 text-success'
      }`}>
        <div className="flex items-center justify-between">
          <span>
            Soma atual: <strong>{totalWeight}pts</strong>
            {isUnbalanced && ` — ajuste para somar 100`}
            {!isUnbalanced && ' — ✓ balanceado'}
          </span>
          <button type="button" onClick={resetWeights} className="text-fg-3 hover:text-accent text-xs underline">
            Resetar default
          </button>
        </div>
      </div>

      {/* ─── Filtros estruturados (categorias/marcas via IDs) ─── */}
      <div className="border-t border-border pt-3 mt-6">
        <h3 className="text-sm font-semibold text-fg mb-3">Filtros estruturados</h3>
        <div className="space-y-3">
          {/* Categorias incluídas (parent_id=null) */}
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Categorias incluídas <span className="text-fg-3">(raiz)</span>
            </label>
            <p className="text-xs text-fg-3 mb-2">Busca dinâmica em /api/taxonomy?type=category&parent_id=null</p>
            <div className="text-xs text-fg-2 bg-surface-2 rounded p-2">
              TODO: MultiSelectAsync component (audience.include_category_ids)
            </div>
          </div>

          {/* Subcategorias incluídas */}
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Subcategorias incluídas
            </label>
            <p className="text-xs text-fg-3 mb-2">Busca dinâmica em /api/taxonomy?type=category&parent_id=X</p>
            <div className="text-xs text-fg-2 bg-surface-2 rounded p-2">
              TODO: MultiSelectAsync component (audience.include_subcategory_ids)
            </div>
          </div>

          {/* Marcas incluídas */}
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Marcas incluídas
            </label>
            <p className="text-xs text-fg-3 mb-2">Busca dinâmica em /api/taxonomy?type=brand</p>
            <div className="text-xs text-fg-2 bg-surface-2 rounded p-2">
              TODO: MultiSelectAsync component (audience.include_brand_ids)
            </div>
          </div>

          {/* Marcas/Categorias excluídas */}
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Marcas/Categorias excluídas (hard filter)
            </label>
            <p className="text-xs text-fg-3 mb-2">Produtos com essas marcas/categorias NÃO passam (score=0)</p>
            <div className="text-xs text-fg-2 bg-surface-2 rounded p-2">
              TODO: MultiSelectAsync components (audience.exclude_brand_ids, audience.exclude_category_ids)
            </div>
          </div>
        </div>
      </div>

      {/* ─── Atributos requeridos e preferidos ─── */}
      <div className="border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-fg mb-3">Atributos do produto</h3>
        <div className="space-y-3">
          {/* Atributos requeridos */}
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Atributos requeridos (hard filter)
            </label>
            <p className="text-xs text-fg-3 mb-2">Produto DEVE ter todos os atributos selecionados (score=0 se não tiver)</p>
            <div className="grid grid-cols-2 gap-2">
              {['Cor', 'Tamanho', 'Voltagem', 'Capacidade'].map(attr => (
                <div key={attr} className="text-xs text-fg-2 bg-surface-2 rounded p-2">
                  {attr}: TODO Dropdown
                </div>
              ))}
            </div>
          </div>

          {/* Atributos preferidos */}
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Atributos preferidos (soft, contribui ao score)
            </label>
            <p className="text-xs text-fg-3 mb-2">Cada atributo satisfeito aumenta o score proporcionalmente</p>
            <div className="grid grid-cols-2 gap-2">
              {['Cor', 'Tamanho', 'Voltagem', 'Capacidade'].map(attr => (
                <div key={attr} className="text-xs text-fg-2 bg-surface-2 rounded p-2">
                  {attr}: TODO Dropdown
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gênero (não entra no score, é só metadado de audiência) */}
      <div className="border-t border-border pt-3">
        <label className="text-xs text-fg-2 block mb-1">
          Gênero predominante <span className="text-fg-3">(metadado, não pontua)</span>
        </label>
        <select
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
          value={form.gender}
          onChange={e => setField('gender', e.target.value)}
        >
          <option value="">Não especificado</option>
          <option value="mix">Misto</option>
          <option value="m">Masculino</option>
          <option value="f">Feminino</option>
        </select>
      </div>

      <Button
        variant="primary"
        size="sm"
        loading={saveMut.isPending}
        onClick={() => saveMut.mutate()}
      >
        {saved ? '✓ Salvo!' : 'Salvar pontuação'}
      </Button>

      {/* Fórmula viva */}
      <div className="bg-surface-2 rounded-md p-3 text-xs text-fg-2 font-mono">
        <p className="font-medium text-fg mb-1 font-sans">Fórmula:</p>
        score = {form.w_category}·cat + {form.w_brand}·brand + {form.w_drop}·drop + {form.w_price}·price + {form.w_history}·hist
      </div>
    </div>
  )
}
