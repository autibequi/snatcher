import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui'
import { apiClient } from '../lib/apiClient'

// ── Editor de audiência do canal ─────────────────────────────────────────────
export default function AudienceEditor({ channelId, audience }: { channelId: string; audience: any }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    categories: '',
    brands: '',
    min_drop: '',
    min_price: '',
    max_price: '',
    gender: '',
  })
  const [saved, setSaved] = React.useState(false)

  // Sincronizar com dados do servidor
  React.useEffect(() => {
    if (!audience) return
    setForm({
      categories: (audience.categories ?? []).join(', '),
      brands: (audience.brands ?? []).join(', '),
      min_drop: audience.min_drop ? String(audience.min_drop) : '',
      min_price: audience.min_price ? String(audience.min_price) : '',
      max_price: audience.max_price ? String(audience.max_price) : '',
      gender: audience.gender ?? '',
    })
  }, [audience])

  const saveMut = useMutation({
    mutationFn: () => {
      const newAudience = {
        categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
        brands: form.brands.split(',').map(s => s.trim()).filter(Boolean),
        min_drop: form.min_drop ? Number(form.min_drop) : 0,
        min_price: form.min_price ? Number(form.min_price) : 0,
        max_price: form.max_price ? Number(form.max_price) : 0,
        gender: form.gender || 'mix',
        locales: audience?.locales ?? [],
        age_range: audience?.age_range ?? [0, 99],
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
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar audiência'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-fg">Perfil de audiência</h3>
        <p className="text-xs text-fg-3">Usado pelo Match para calcular fit produto → canal</p>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">
          Categorias de produto
          <span className="text-fg-3 ml-1">(separe por vírgula)</span>
        </label>
        <input
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          placeholder="suplementos, proteinas, vitaminas..."
          value={form.categories}
          onChange={e => set('categories', e.target.value)}
        />
        <p className="text-xs text-fg-3 mt-1">
          Produtos com estas categorias ganham +30pts no score
        </p>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">
          Marcas preferidas
          <span className="text-fg-3 ml-1">(separe por vírgula)</span>
        </label>
        <input
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          placeholder="Growth, Integral Medica, Xpro..."
          value={form.brands}
          onChange={e => set('brands', e.target.value)}
        />
        <p className="text-xs text-fg-3 mt-1">
          Produtos destas marcas ganham +20pts no score
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-fg-2 block mb-1">Drop mínimo (%)</label>
          <input
            type="number" min="0" max="100"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="10"
            value={form.min_drop}
            onChange={e => set('min_drop', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Preço mín (R$)</label>
          <input
            type="number" min="0"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="0"
            value={form.min_price}
            onChange={e => set('min_price', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Preço máx (R$)</label>
          <input
            type="number" min="0"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="9999"
            value={form.max_price}
            onChange={e => set('max_price', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Gênero predominante</label>
        <select
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
          value={form.gender}
          onChange={e => set('gender', e.target.value)}
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
        {saved ? '✓ Salvo!' : 'Salvar audiência'}
      </Button>

      {/* Preview do impacto no score */}
      {(form.categories || form.brands || form.min_drop) && (
        <div className="bg-surface-2 rounded-md p-3 text-xs text-fg-2">
          <p className="font-medium text-fg mb-1">Impacto no Match:</p>
          <p>Produtos {form.categories ? `de "${form.categories.split(',')[0].trim()}"` : 'de qualquer categoria'} com {form.min_drop ? `desconto ≥ ${form.min_drop}%` : 'qualquer desconto'} e preço {form.min_price || form.max_price ? `R$ ${form.min_price || 0}–${form.max_price || '∞'}` : 'qualquer'} terão score alto.</p>
        </div>
      )}
    </div>
  )
}
