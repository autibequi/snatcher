import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { authFetch } from '../lib/authFetch'
import { Button, Card, toast } from '../components/ui'
import { ChevronDown, ChevronRight, Search, RotateCcw, ExternalLink } from '../lib/icons'
import { BaselineTab } from './admin/BaselineTab'

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

// SECTIONS agrupa os parâmetros por tema, numa única página rolável (sem sub-abas).
// Cada seção é retrátil. A última (catch-all) recolhe tudo que não bateu em nenhum prefixo.
interface SectionDef {
  id: string
  label: string
  hint: string
  prefixes: string[]
}

const SECTIONS: SectionDef[] = [
  {
    id: 'score',
    label: 'Seleção & Score',
    hint: 'O que entra na fila e com que peso',
    prefixes: ['score', 'quality_threshold', 'baseline_min', 'cap_max', 'epsilon', 'anti_saturation', 'diversity', 'half_life', 'antirepeat', 'repromo', 'click', 'learned'],
  },
  {
    id: 'dispatch',
    label: 'Cadência & Envio',
    hint: 'Ritmo e segurança dos disparos',
    prefixes: ['dispatch', 'cooldown', 'quarantine', 'send_window'],
  },
  {
    id: 'catalog',
    label: 'Catálogo & Taxonomia',
    hint: 'Coleta e classificação de produtos',
    prefixes: ['catalog', 'taxonomy', 'fold', 'min_taxonomy'],
  },
  {
    id: 'jonfrey',
    label: 'Jonfrey (auto-tuning)',
    hint: 'Automação do agente de ajuste',
    prefixes: ['jonfrey', 'use_algo'],
  },
  {
    id: 'outros',
    label: 'Outros',
    hint: 'Parâmetros sem categoria definida',
    prefixes: [], // catch-all
  },
]

const SCOPE_LABELS: Record<string, string> = {
  global: 'Global',
  modem: 'Por modem',
  group: 'Por grupo',
  category: 'Por categoria',
}

function paramLabel(name: string): string {
  return PARAM_META[name]?.label ?? name
}

function paramDescription(name: string): string {
  return PARAM_META[name]?.description ?? ''
}

// resolveSection retorna o id da seção que deve exibir um parâmetro.
function resolveSection(paramName: string): string {
  for (const section of SECTIONS) {
    if (section.prefixes.length === 0) continue
    if (section.prefixes.some(prefix => paramName.startsWith(prefix))) {
      return section.id
    }
  }
  return 'outros'
}

// matchesQuery testa se um parâmetro casa com a busca (nome técnico, label ou descrição).
function matchesQuery(param: TunableParam, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    param.param_name.toLowerCase().includes(q) ||
    paramLabel(param.param_name).toLowerCase().includes(q) ||
    paramDescription(param.param_name).toLowerCase().includes(q)
  )
}

// ─── ParamRow ───────────────────────────────────────────────────────────────────

interface ParamRowProps {
  param: TunableParam
  value: string
  busy: boolean
  onChange: (value: string) => void
  onSave: () => void
  onReset: () => void
}

function ParamRow({ param, value, busy, onChange, onSave, onReset }: ParamRowProps) {
  const numVal = parseFloat(value)
  const outOfRange =
    !Number.isNaN(numVal) && (numVal < param.min_value || numVal > param.max_value)
  const invalid = value.trim() === '' || Number.isNaN(numVal)
  const dirty = value !== String(param.current_value)
  const changedFromDefault = param.current_value !== param.default_value

  return (
    <div className="px-4 py-3 border-b border-border last:border-0 flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Identidade + descrição */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-fg">{paramLabel(param.param_name)}</span>
          {param.scope_type !== 'global' && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-surface-2 text-fg-3">
              {SCOPE_LABELS[param.scope_type] ?? param.scope_type}
              {param.scope_id ? ` #${param.scope_id}` : ''}
            </span>
          )}
        </div>
        <p className="text-[10px] text-fg-4 font-mono mt-0.5">{param.param_name}</p>
        {paramDescription(param.param_name) && (
          <p className="text-xs text-fg-3 mt-1 leading-snug">{paramDescription(param.param_name)}</p>
        )}
      </div>

      {/* Controle */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end">
          <input
            type="number"
            value={value}
            min={param.min_value}
            max={param.max_value}
            step="any"
            onChange={e => onChange(e.target.value)}
            disabled={busy}
            className={[
              'w-28 border rounded-md px-2 py-1 text-sm bg-surface text-fg focus:outline-none focus:ring-2',
              outOfRange || invalid
                ? 'border-danger focus:ring-danger/30'
                : 'border-border focus:ring-accent/30',
            ].join(' ')}
          />
          <span className="text-[10px] text-fg-4 mt-0.5 tabular-nums">
            padrão {param.default_value} · {param.min_value}–{param.max_value}
          </span>
          {outOfRange && (
            <span className="text-[10px] text-danger mt-0.5">fora do limite</span>
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={busy}
          disabled={busy || !dirty || invalid || outOfRange}
        >
          Salvar
        </Button>
        <button
          type="button"
          onClick={onReset}
          disabled={busy || !changedFromDefault}
          title={changedFromDefault ? `Resetar para o padrão (${param.default_value})` : 'Já está no padrão'}
          className="p-1.5 rounded-md text-fg-3 hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Resetar para o padrão"
        >
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
    </div>
  )
}

// ─── ParamSection (retrátil) ──────────────────────────────────────────────────

interface ParamSectionProps {
  def: SectionDef
  params: TunableParam[]
  open: boolean
  onToggle: () => void
  editValues: Record<number, string>
  saving: Record<number, boolean>
  onEdit: (id: number, value: string) => void
  onSave: (param: TunableParam) => void
  onReset: (param: TunableParam) => void
}

function ParamSection({ def, params, open, onToggle, editValues, saving, onEdit, onSave, onReset }: ParamSectionProps) {
  if (params.length === 0) return null

  return (
    <Card padding={false} className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
        aria-expanded={open}
      >
        {open
          ? <ChevronDown size={16} className="text-fg-3 shrink-0" aria-hidden />
          : <ChevronRight size={16} className="text-fg-3 shrink-0" aria-hidden />}
        <span className="text-sm font-semibold text-fg">{def.label}</span>
        <span className="text-xs text-fg-3">{def.hint}</span>
        <span className="ml-auto text-xs tabular-nums text-fg-3 bg-surface-2 px-2 py-0.5 rounded-full">
          {params.length}
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {params.map(param => (
            <ParamRow
              key={param.id}
              param={param}
              value={editValues[param.id] ?? String(param.current_value)}
              busy={!!saving[param.id]}
              onChange={value => onEdit(param.id, value)}
              onSave={() => onSave(param)}
              onReset={() => onReset(param)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminParams({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useState<TunableParam[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [query, setQuery] = useState('')
  // Seções abertas: primeira aberta por default; busca abre todas.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ [SECTIONS[0].id]: true })

  const load = async () => {
    setLoading(true)
    try {
      const response = await authFetch('/api/admin/parameters')
      const data: TunableParam[] = await response.json()
      setParams(data || [])
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
    const numVal = parseFloat(editValues[param.id])
    if (Number.isNaN(numVal)) {
      toast('Valor inválido', 'error')
      return
    }
    if (numVal < param.min_value || numVal > param.max_value) {
      toast(`Fora dos limites (${param.min_value}–${param.max_value})`, 'error')
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
        toast(`Erro ao salvar: ${err.error || response.statusText}`, 'error')
        return
      }
      toast(`${paramLabel(param.param_name)} salvo`, 'ok')
      await load()
    } finally {
      setSaving(prev => ({ ...prev, [param.id]: false }))
    }
  }

  const handleReset = async (param: TunableParam) => {
    setSaving(prev => ({ ...prev, [param.id]: true }))
    try {
      const response = await authFetch(`/api/admin/parameters/${param.id}/reset`, {
        method: 'POST',
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }))
        toast(`Erro ao resetar: ${err.error || response.statusText}`, 'error')
        return
      }
      toast(`${paramLabel(param.param_name)} resetado para o padrão`, 'ok')
      await load()
    } finally {
      setSaving(prev => ({ ...prev, [param.id]: false }))
    }
  }

  const searching = query.trim().length > 0

  // Agrupa os parâmetros (filtrados pela busca) por seção.
  const paramsBySection = useMemo(() => {
    const visible = params.filter(p => matchesQuery(p, query.trim()))
    const map: Record<string, TunableParam[]> = {}
    for (const section of SECTIONS) map[section.id] = []
    for (const p of visible) map[resolveSection(p.param_name)].push(p)
    return map
  }, [params, query])

  const totalVisible = useMemo(
    () => Object.values(paramsBySection).reduce((acc, list) => acc + list.length, 0),
    [paramsBySection],
  )

  const toggleSection = (id: string) =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className={embedded ? 'space-y-5' : 'px-3 py-4 sm:px-4 sm:py-6 max-w-4xl mx-auto space-y-5'}>
      {!embedded && <h1 className="text-2xl font-bold text-fg">Parâmetros tunáveis</h1>}

      {/* Busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar parâmetro por nome ou descrição…"
          className="w-full h-9 pl-9 pr-3 rounded-md bg-surface-2 border border-border text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </div>

      {/* Aviso: roteamento/rate buckets migraram pra Distribuição */}
      <Link
        to="/admin/dispatch/routing"
        className="flex items-center gap-2 text-xs text-fg-3 hover:text-fg px-3 py-2 rounded-md border border-dashed border-border hover:border-border-strong transition-colors"
      >
        <ExternalLink size={13} aria-hidden />
        Roteamento de modems e Rate Buckets agora ficam em <span className="text-accent font-medium">Distribuição › Roteamento</span>
      </Link>

      {loading && <p className="text-fg-3 text-sm">Carregando…</p>}

      {!loading && (
        <>
          {searching && totalVisible === 0 && (
            <p className="text-sm text-fg-3 text-center py-8">
              Nenhum parâmetro encontrado para “{query.trim()}”.
            </p>
          )}

          <div className="space-y-3">
            {SECTIONS.map(section => (
              <ParamSection
                key={section.id}
                def={section}
                params={paramsBySection[section.id] ?? []}
                // Durante a busca, todas as seções com resultado ficam abertas.
                open={searching ? true : openSections[section.id] ?? false}
                onToggle={() => toggleSection(section.id)}
                editValues={editValues}
                saving={saving}
                onEdit={handleEdit}
                onSave={handleSave}
                onReset={handleReset}
              />
            ))}
          </div>

          {/* Baseline / snapshots — ferramenta de medição, mantida ao pé da página */}
          {!searching && (
            <Card padding={false} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('baseline')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
                aria-expanded={!!openSections.baseline}
              >
                {openSections.baseline
                  ? <ChevronDown size={16} className="text-fg-3 shrink-0" aria-hidden />
                  : <ChevronRight size={16} className="text-fg-3 shrink-0" aria-hidden />}
                <span className="text-sm font-semibold text-fg">Baseline & Snapshots</span>
                <span className="text-xs text-fg-3">Capturar/comparar métricas antes e depois de ajustes</span>
              </button>
              {openSections.baseline && (
                <div className="border-t border-border p-4">
                  <BaselineTab />
                </div>
              )}
            </Card>
          )}

          {params.length === 0 && (
            <p className="text-fg-3 text-sm">Nenhum parâmetro encontrado.</p>
          )}
        </>
      )}
    </div>
  )
}
