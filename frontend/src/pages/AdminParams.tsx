import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'
import { sectionCard, pageContainer } from '../lib/uiTokens'

interface TunableParam {
  id: number
  scope_type: string
  scope_id?: number
  param_name: string
  current_value: number
  default_value: number
  min_value: number
  max_value: number
  last_changed?: string
  last_change_by?: string
}

const STRANGLER_FLAGS = ['use_algo_tick', 'use_send_queue', 'catalog_source']

const PARAM_META: Record<string, { label: string; description: string }> = {
  // Flags strangler
  use_algo_tick:          { label: 'Algoritmo de seleção',    description: 'Ativa o tick do algo — score ponderado por qualidade, frescor e diversidade ao escolher produtos para envio.' },
  use_send_queue:         { label: 'Fila de envio',           description: 'Usa a fila particionada por modem em vez do dispatcher legado.' },
  catalog_source:         { label: 'Catálogo v2',             description: 'Lê produtos do catálogo novo (0 = legado, 1 = v2 cimentado).' },
  // Qualidade e seleção
  quality_threshold:      { label: 'Score mínimo de qualidade', description: 'Produtos com score abaixo desse valor não entram na fila. Aumentar = mais seletivo.' },
  baseline_min:           { label: 'Mínimo diário por grupo',   description: 'Garante ao menos N envios por dia mesmo em grupos com score baixo.' },
  cap_max:                { label: 'Máximo diário por grupo',   description: 'Teto de envios por grupo por dia. Protege contra saturação.' },
  // Cadência de envio
  cooldown_seconds:       { label: 'Cooldown entre envios (s)', description: 'Intervalo mínimo entre dois disparos do mesmo modem, em segundos.' },
  // Decaimento temporal
  half_life_freshness:    { label: 'Meia-vida de frescor (dias)',  description: 'Após quantos dias um produto perde metade do bônus por ser novo no catálogo.' },
  half_life_learned:      { label: 'Meia-vida do peso aprendido (dias)', description: 'Após quantos dias o histórico de conversão perde metade do peso no score.' },
  // Diversidade
  anti_saturation_decay:  { label: 'Penalidade de saturação',   description: 'Fator de desconto para produtos já enviados recentemente ao mesmo grupo. Menor = penalidade mais forte.' },
  diversity_bonus_weight: { label: 'Peso de diversidade',       description: 'Bônus aplicado quando o produto é de uma categoria diferente dos últimos enviados ao grupo.' },
  // Exploração
  epsilon_base:           { label: 'Taxa de exploração',        description: 'Probabilidade inicial de escolher um produto aleatório em vez do de maior score (evita viés).' },
  epsilon_decay_rate:     { label: 'Velocidade de decay da exploração', description: 'Quão rápido a exploração aleatória diminui com o tempo conforme o modelo aprende.' },
}

function paramLabel(name: string): string {
  return PARAM_META[name]?.label ?? name
}
function paramDescription(name: string): string {
  return PARAM_META[name]?.description ?? ''
}

function isStranglerFlag(name: string): boolean {
  return STRANGLER_FLAGS.includes(name)
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

export default function AdminParams() {
  const [params, setParams] = useState<TunableParam[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  const load = async () => {
    setLoading(true)
    try {
      const r = await authFetch('/api/admin/parameters')
      const data: TunableParam[] = await r.json()
      setParams(data || [])
      // Inicializa campos de edição com current_value
      const vals: Record<number, string> = {}
      for (const p of data || []) {
        vals[p.id] = String(p.current_value)
      }
      setEditValues(vals)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (param: TunableParam) => {
    const rawVal = editValues[param.id]
    const numVal = parseFloat(rawVal)
    if (isNaN(numVal)) {
      alert('Valor inválido')
      return
    }
    if (numVal < param.min_value || numVal > param.max_value) {
      alert(`Valor fora dos limites: min=${param.min_value}, max=${param.max_value}`)
      return
    }
    if (!window.confirm(`Salvar ${param.param_name} = ${numVal}?`)) return
    setSaving(s => ({ ...s, [param.id]: true }))
    try {
      const r = await authFetch(`/api/admin/parameters/${param.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: numVal }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }))
        alert(`Erro ao salvar: ${err.error || r.statusText}`)
        return
      }
      await load()
    } finally {
      setSaving(s => ({ ...s, [param.id]: false }))
    }
  }

  const handleReset = async (param: TunableParam) => {
    if (!window.confirm(`Resetar ${param.param_name} para o valor padrão (${param.default_value})?`)) return
    setSaving(s => ({ ...s, [param.id]: true }))
    try {
      const r = await authFetch(`/api/admin/parameters/${param.id}/reset`, { method: 'POST' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }))
        alert(`Erro ao resetar: ${err.error || r.statusText}`)
        return
      }
      await load()
    } finally {
      setSaving(s => ({ ...s, [param.id]: false }))
    }
  }

  const handleToggle = async (param: TunableParam) => {
    const newVal = param.current_value === 0 ? 1 : 0
    if (!window.confirm(`${newVal === 1 ? 'Ativar' : 'Desativar'} ${param.param_name}?`)) return
    setSaving(s => ({ ...s, [param.id]: true }))
    try {
      const r = await authFetch(`/api/admin/parameters/${param.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newVal }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }))
        alert(`Erro: ${err.error || r.statusText}`)
        return
      }
      await load()
    } finally {
      setSaving(s => ({ ...s, [param.id]: false }))
    }
  }

  const stranglerParams = params.filter(p => isStranglerFlag(p.param_name))
  const regularParams = params.filter(p => !isStranglerFlag(p.param_name))
  const grouped = groupBy(regularParams, p => p.scope_type)
  const scopeOrder = ['global', 'modem', 'group', 'category']
  const sortedScopes = [...new Set([...scopeOrder, ...Object.keys(grouped)])].filter(s => grouped[s])

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-6 max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold">Parâmetros tunáveis</h1>

      {loading && <p className="text-fg-3">Carregando...</p>}

      {/* Flags strangler — destaque no topo */}
      {!loading && stranglerParams.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-3">
            Flags Strangler
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stranglerParams.map(p => {
              const isOn = p.current_value !== 0
              const isBusy = saving[p.id]
              return (
                <div
                  key={p.id}
                  className="border rounded-lg p-4 bg-surface shadow-sm flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-fg">{paramLabel(p.param_name)}</p>
                      <p className="text-[10px] text-fg-3 font-mono mt-0.5">{p.param_name}</p>
                    </div>
                    <button
                      onClick={() => handleToggle(p)}
                      disabled={isBusy}
                      className={[
                        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none',
                        isOn ? 'bg-green-500' : 'bg-gray-300',
                        isBusy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                      aria-label={isOn ? 'Desativar' : 'Ativar'}
                    >
                      <span
                        className={[
                          'inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform',
                          isOn ? 'translate-x-6' : 'translate-x-1',
                        ].join(' ')}
                      />
                    </button>
                  </div>
                  {paramDescription(p.param_name) && (
                    <p className="text-xs text-fg-3 leading-snug">{paramDescription(p.param_name)}</p>
                  )}
                  <span className={['text-xs font-medium', isOn ? 'text-green-600' : 'text-fg-4'].join(' ')}>
                    {isOn ? 'ON' : 'OFF'}
                  </span>
                  {p.last_changed && (
                    <p className="text-xs text-fg-4">
                      Alterado: {p.last_changed}
                      {p.last_change_by ? ` por ${p.last_change_by}` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Params regulares agrupados por scope_type */}
      {!loading && sortedScopes.map(scope => (
        <section key={scope}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-3">
            {scope === 'global' ? 'Globais' : scope === 'modem' ? 'Por modem' : scope === 'group' ? 'Por grupo' : scope === 'category' ? 'Por categoria' : scope}
          </h2>
          <div className="border rounded-lg bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Parâmetro</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Valor atual</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2 hidden md:table-cell">
                    Padrão / Min / Max
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2 hidden lg:table-cell">
                    Última alteração
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped[scope].map(p => {
                  const isBusy = saving[p.id]
                  return (
                    <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3">
                        <span
                          className="font-semibold text-fg cursor-help"
                          title={paramDescription(p.param_name) ? `${paramDescription(p.param_name)}\n\n(${p.param_name})` : p.param_name}
                        >
                          {paramLabel(p.param_name)}
                        </span>
                        <p className="text-[10px] text-fg-3 font-mono mt-0.5">{p.param_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={editValues[p.id] ?? String(p.current_value)}
                          min={p.min_value}
                          max={p.max_value}
                          step="any"
                          onChange={e =>
                            setEditValues(v => ({ ...v, [p.id]: e.target.value }))
                          }
                          className="w-28 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          disabled={isBusy}
                        />
                      </td>
                      <td className="px-4 py-3 text-fg-3 hidden md:table-cell">
                        {p.default_value} / {p.min_value} / {p.max_value}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-4 hidden lg:table-cell">
                        {p.last_changed
                          ? `${p.last_changed}${p.last_change_by ? ` · ${p.last_change_by}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSave(p)}
                            disabled={isBusy}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium disabled:opacity-50"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => handleReset(p)}
                            disabled={isBusy}
                            className="px-3 py-1 bg-surface-3 rounded hover:bg-gray-300 text-xs font-medium disabled:opacity-50"
                          >
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!loading && params.length === 0 && (
        <p className="text-fg-3">Nenhum parâmetro encontrado.</p>
      )}
    </div>
  )
}
