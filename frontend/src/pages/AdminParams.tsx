import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'
import { Tabs } from '../components/ui/Tabs'
import { BaselineTab } from './admin/BaselineTab'
import DispatchRoutingView from './admin/DispatchRoutingView'
import RateBucketsView from './admin/RateBucketsView'

// AdminParamsTab define as 5 abas disponíveis na página de parâmetros tunáveis.
type AdminParamsTab = 'dispatch' | 'score' | 'catalog' | 'jonfrey' | 'baseline'

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

const PARAM_META: Record<string, { label: string; description: string }> = {
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
  diversity_bonus_weight: { label: 'Peso de diversidade',       description: 'Bônus de diversidade no re-rank MMR (1 - peso = lambda da fórmula). Maior = mais diversidade de categoria por grupo/dia.' },
  // Exploração
  epsilon_base:           { label: 'Taxa de exploração',        description: 'Probabilidade inicial de escolher um produto aleatório em vez do de maior score (evita viés). [Fase 2 do Scoring v2]' },
  epsilon_decay_rate:     { label: 'Velocidade de decay da exploração', description: 'Quão rápido a exploração aleatória diminui com o tempo conforme o modelo aprende.' },
  // Scoring v2 — pesos da fórmula composta
  score_weight_quality:    { label: 'Peso · Qualidade intrínseca', description: 'Coeficiente w_q na fórmula composta. Multiplica quality_score do produto (0..1).' },
  score_weight_affinity:   { label: 'Peso · Afinidade grupo×categoria', description: 'Coeficiente w_a. Multiplica group_category_affinity (ajustado pelo loop affinity_adjust).' },
  score_weight_channel:    { label: 'Peso · Pesos do canal',     description: 'Coeficiente w_w. Multiplica channel_category_weights/100 (sliders na página Canais).' },
  score_weight_ctr:        { label: 'Peso · CTR 30d',            description: 'Coeficiente w_c. Multiplica learned_weights.ctr_30d (cliques/envios do grupo×categoria nos últimos 30 dias).' },
  score_weight_epc:        { label: 'Peso · EPC 30d',            description: 'Coeficiente w_e. Multiplica learned_weights.epc_30d (earnings per click, clampado em 1.0).' },
  score_weight_freshness:  { label: 'Peso · Frescor (recência)', description: 'Coeficiente w_f. Multiplica decay exponencial baseado em send_ready_at e half_life_freshness.' },
  score_weight_saturation: { label: 'Peso · Anti-saturação',     description: 'Coeficiente w_s (subtraído do score). Multiplica anti_saturation_decay^n_sends_24h da mesma categoria no grupo.' },
  // Anti-repeat e bypass de re-promoção
  antirepeat_window_days:         { label: 'Janela anti-repeat (dias)',  description: 'Dias mínimos entre dois envios do MESMO produto no MESMO grupo (default 7d). Pode ser furada pelo bypass de re-promo.' },
  antirepeat_window_days_price_up:{ label: 'Janela estendida quando preço subiu', description: 'Dias mínimos quando o produto piorou desde o último envio (default 14d). Evita repostar produto que ficou pior.' },
  repromo_drop_threshold:         { label: 'Re-promo · Queda mínima',    description: 'Queda relativa de preço (vs último envio) necessária pra furar a janela anti-repeat. 0.10 = 10% mais barato que da última vez.' },
  repromo_cooldown_hours:         { label: 'Re-promo · Cooldown (h)',    description: 'Horas mínimas entre dois envios do mesmo produto mesmo com bypass. Protege contra picos de scrape gerando flood.' },
  // Click reward + decay temporal (fecha o loop click → scoring)
  click_reward_weight:            { label: 'Recompensa por click (Thompson)', description: 'Quanto cada click incrementa em alpha do bandit. 0.10 = 10 clicks valem 1 conversão. Acelera convergência do Thompson Sampling.' },
  learned_half_life_days:         { label: 'Meia-vida do decay em CTR/EPC',   description: 'Dias após os quais um click/conversão dentro da janela 30d vale metade. Default 7d — sinaliza tendência recente sem perder cauda longa.' },
  click_cap_per_member:           { label: 'Cap viral · clicks/membro',       description: 'Limite de clicks que contam pro learning = k × member_count. Clicks acima são considerados viralização externa e ficam só em group_virality (não envenenam CTR/bandit). Default 3.0.' },
  // Segurança de envio
  quarantine_threshold:           { label: 'Quarentena · falhas consecutivas', description: 'Número de falhas de envio consecutivas antes de colocar a conta em quarentena. Aumente para reduzir quarentenas automáticas. 999 = desativado.' },
  // Taxonomia e loop de correção (W3)
  min_taxonomy_confidence:        { label: 'Confiança mínima de taxonomia', description: 'W3: confiança mínima (0–1) das funções classify_catalog_brand/category. Itens abaixo desse valor são automaticamente enfileirados em catalog_llm_queue para revisão LLM. Default 0.70 = 70%.' },
}

// TAB_DEFS define as 5 abas e os prefixos de param_name que pertencem a cada uma.
// A aba 'baseline' captura tudo que não bateu em nenhuma outra (catch-all).
const TAB_DEFS: Array<{ id: AdminParamsTab; label: string; prefixes: string[] }> = [
  { id: 'dispatch',  label: 'Dispatch',  prefixes: ['dispatch', 'cooldown', 'quarantine', 'send_window'] },
  { id: 'score',     label: 'Score',     prefixes: ['score', 'quality_threshold', 'epsilon', 'anti_saturation', 'diversity', 'half_life', 'antirepeat', 'repromo', 'click', 'learned'] },
  { id: 'catalog',   label: 'Catálogo',  prefixes: ['catalog', 'taxonomy', 'fold', 'min_taxonomy'] },
  { id: 'jonfrey',   label: 'Jonfrey',   prefixes: ['jonfrey', 'use_algo'] },
  { id: 'baseline',  label: 'Baseline',  prefixes: [] },
]

// TAB_LABELS é o array de tabs no formato esperado pelo componente Tabs.
const TAB_LABELS = TAB_DEFS.map(tab => ({ id: tab.id, label: tab.label }))

function paramLabel(name: string): string {
  return PARAM_META[name]?.label ?? name
}

function paramDescription(name: string): string {
  return PARAM_META[name]?.description ?? ''
}

// resolveParamTab retorna qual aba deve exibir um parâmetro baseado no param_name.
// Tenta cada aba em ordem; se nenhum prefixo bater, cai em 'baseline'.
function resolveParamTab(paramName: string): AdminParamsTab {
  for (const tabDef of TAB_DEFS) {
    if (tabDef.prefixes.length === 0) {
      continue
    }
    const matches = tabDef.prefixes.some(prefix => paramName.startsWith(prefix))
    if (matches) {
      return tabDef.id
    }
  }
  return 'baseline'
}

// filterParamsByTab retorna os parâmetros que pertencem a uma determinada aba.
function filterParamsByTab(params: TunableParam[], tab: AdminParamsTab): TunableParam[] {
  if (tab === 'baseline') {
    // Baseline pega tudo que não pertence a nenhuma outra aba.
    return params.filter(param => resolveParamTab(param.param_name) === 'baseline')
  }
  return params.filter(param => resolveParamTab(param.param_name) === tab)
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const keyValue = key(item)
    if (!acc[keyValue]) {
      acc[keyValue] = []
    }
    acc[keyValue].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ParamsTable renderiza a tabela de parâmetros tunáveis para um conjunto de params.
// Reutilizada em todas as abas que exibem params diretamente.
function ParamsTable({
  params,
  editValues,
  saving,
  onEdit,
  onSave,
  onReset,
}: {
  params: TunableParam[]
  editValues: Record<number, string>
  saving: Record<number, boolean>
  onEdit: (id: number, value: string) => void
  onSave: (param: TunableParam) => void
  onReset: (param: TunableParam) => void
}) {
  if (params.length === 0) {
    return <p className="text-fg-3 text-sm">Nenhum parâmetro nesta aba.</p>
  }

  const grouped = groupBy(params, param => param.scope_type)
  const scopeOrder = ['global', 'modem', 'group', 'category']
  const sortedScopes = [...new Set([...scopeOrder, ...Object.keys(grouped)])].filter(
    scope => grouped[scope]
  )

  return (
    <div className="space-y-6">
      {sortedScopes.map(scope => (
        <section key={scope}>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-3">
            {scope === 'global'
              ? 'Globais'
              : scope === 'modem'
              ? 'Por modem'
              : scope === 'group'
              ? 'Por grupo'
              : scope === 'category'
              ? 'Por categoria'
              : scope}
          </h3>
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
              <tbody className="divide-y divide-border">
                {grouped[scope].map(param => {
                  const isBusy = saving[param.id]
                  return (
                    <tr key={param.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3">
                        <span
                          className="font-semibold text-fg cursor-help"
                          title={
                            paramDescription(param.param_name)
                              ? `${paramDescription(param.param_name)}\n\n(${param.param_name})`
                              : param.param_name
                          }
                        >
                          {paramLabel(param.param_name)}
                        </span>
                        <p className="text-[10px] text-fg-3 font-mono mt-0.5">{param.param_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={editValues[param.id] ?? String(param.current_value)}
                          min={param.min_value}
                          max={param.max_value}
                          step="any"
                          onChange={e => onEdit(param.id, e.target.value)}
                          className="w-28 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          disabled={isBusy}
                        />
                      </td>
                      <td className="px-4 py-3 text-fg-3 hidden md:table-cell">
                        {param.default_value} / {param.min_value} / {param.max_value}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-4 hidden lg:table-cell">
                        {param.last_changed
                          ? `${param.last_changed}${param.last_change_by ? ` · ${param.last_change_by}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => onSave(param)}
                            disabled={isBusy}
                            className="px-3 py-1 bg-accent text-white rounded hover:bg-accent-hover text-xs font-medium disabled:opacity-50"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => onReset(param)}
                            disabled={isBusy}
                            className="px-3 py-1 bg-surface-3 rounded hover:bg-border text-xs font-medium disabled:opacity-50"
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
    </div>
  )
}

export default function AdminParams({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useState<TunableParam[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [activeTab, setActiveTab] = useState<AdminParamsTab>('dispatch')

  const load = async () => {
    setLoading(true)
    try {
      const response = await authFetch('/api/admin/parameters')
      const data: TunableParam[] = await response.json()
      setParams(data || [])
      // Inicializa campos de edição com current_value
      const vals: Record<number, string> = {}
      for (const param of data || []) {
        vals[param.id] = String(param.current_value)
      }
      setEditValues(vals)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleEdit = (id: number, value: string) => {
    setEditValues(prev => ({ ...prev, [id]: value }))
  }

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
    if (!window.confirm(`Salvar ${param.param_name} = ${numVal}?`)) {
      return
    }
    setSaving(prev => ({ ...prev, [param.id]: true }))
    try {
      const response = await authFetch(`/api/admin/parameters/${param.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: numVal }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }))
        alert(`Erro ao salvar: ${err.error || response.statusText}`)
        return
      }
      await load()
    } finally {
      setSaving(prev => ({ ...prev, [param.id]: false }))
    }
  }

  const handleReset = async (param: TunableParam) => {
    if (!window.confirm(`Resetar ${param.param_name} para o valor padrão (${param.default_value})?`)) {
      return
    }
    setSaving(prev => ({ ...prev, [param.id]: true }))
    try {
      const response = await authFetch(`/api/admin/parameters/${param.id}/reset`, {
        method: 'POST',
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }))
        alert(`Erro ao resetar: ${err.error || response.statusText}`)
        return
      }
      await load()
    } finally {
      setSaving(prev => ({ ...prev, [param.id]: false }))
    }
  }

  // tabParams filtra os parâmetros para a aba ativa.
  const tabParams = filterParamsByTab(params, activeTab)

  return (
    <div className={embedded ? 'space-y-6' : 'px-3 py-4 sm:px-4 sm:py-6 max-w-5xl space-y-6'}>
      {!embedded && <h1 className="text-2xl font-bold">Parâmetros tunáveis</h1>}

      {/* Navegação de abas */}
      <Tabs
        tabs={TAB_LABELS}
        active={activeTab}
        onChange={id => setActiveTab(id as AdminParamsTab)}
      />

      {loading && <p className="text-fg-3">Carregando...</p>}

      {/* Conteúdo da aba Dispatch: params de dispatch + DispatchRoutingView + RateBucketsView */}
      {!loading && activeTab === 'dispatch' && (
        <div className="space-y-8">
          <ParamsTable
            params={tabParams}
            editValues={editValues}
            saving={saving}
            onEdit={handleEdit}
            onSave={handleSave}
            onReset={handleReset}
          />
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-3">
              Roteamento de modems
            </h2>
            <DispatchRoutingView />
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-3">
              Rate buckets
            </h2>
            <RateBucketsView />
          </section>
        </div>
      )}

      {/* Conteúdo da aba Score: params de score */}
      {!loading && activeTab === 'score' && (
        <div className="space-y-8">
          <ParamsTable
            params={tabParams}
            editValues={editValues}
            saving={saving}
            onEdit={handleEdit}
            onSave={handleSave}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Conteúdo da aba Catálogo: params de catalog/taxonomy */}
      {!loading && activeTab === 'catalog' && (
        <ParamsTable
          params={tabParams}
          editValues={editValues}
          saving={saving}
          onEdit={handleEdit}
          onSave={handleSave}
          onReset={handleReset}
        />
      )}

      {/* Conteúdo da aba Jonfrey: params jonfrey */}
      {!loading && activeTab === 'jonfrey' && (
        <div className="space-y-8">
          <ParamsTable
            params={tabParams}
            editValues={editValues}
            saving={saving}
            onEdit={handleEdit}
            onSave={handleSave}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Conteúdo da aba Baseline: BaselineTab (já existe e funciona) + params catch-all */}
      {!loading && activeTab === 'baseline' && (
        <div className="space-y-8">
          <BaselineTab />
          {tabParams.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-3 mb-3">
                Outros parâmetros
              </h2>
              <ParamsTable
                params={tabParams}
                editValues={editValues}
                saving={saving}
                onEdit={handleEdit}
                onSave={handleSave}
                onReset={handleReset}
              />
            </section>
          )}
        </div>
      )}

      {!loading && params.length === 0 && (
        <p className="text-fg-3">Nenhum parâmetro encontrado.</p>
      )}
    </div>
  )
}
