import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, KpiCard, Skeleton, Tabs, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const MARKETPLACES = [
  { id: 'amazon',       label: 'Amazon Associates',   field: 'tag',          placeholder: 'snatcher-20',     hint: 'Amazon Associates tracking tag' },
  { id: 'mercadolivre', label: 'Mercado Livre',        field: 'affiliate_id', placeholder: '1234567',          hint: 'ID do afiliado ML' },
  { id: 'magalu',       label: 'Magalu Parceiro',      field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID do parceiro Magalu' },
  { id: 'shopee',       label: 'Shopee Afiliados',     field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Shopee' },
  { id: 'aliexpress',   label: 'AliExpress',           field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado AliExpress' },
  { id: 'kabum',        label: 'Kabum',                field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Kabum' },
  { id: 'americanas',   label: 'Americanas',           field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Americanas' },
  { id: 'casasbahia',   label: 'Casas Bahia',          field: 'affiliate_id', placeholder: 'SEU_ID',           hint: 'ID de afiliado Casas Bahia' },
] as const

interface Program {
  id?: number
  marketplace: string
  active: boolean
  credentials: Record<string, string>
}

interface ProgramStats {
  program_id: number
  clicks_30d: number
  conversions_30d: number
  revenue_30d: number
  last_sync_at: string | null
}

const TABS = [
  { id: 'programs',    label: 'Programas' },
  { id: 'rules',       label: 'Regras de mapeamento' },
  { id: 'postbacks',   label: 'Postbacks (S2S)' },
  { id: 'attribution', label: 'Atribuição & auditoria' },
] as const

type TabId = typeof TABS[number]['id']

// ---------------------------------------------------------------------------
// AffiliateRow (aba Programas)
// ---------------------------------------------------------------------------

interface AffiliateRowProps {
  mkt: typeof MARKETPLACES[number]
  program?: Program
  stats?: ProgramStats
}

function AffiliateRow({ mkt, program, stats }: AffiliateRowProps) {
  const qc = useQueryClient()
  const [value, setValue] = React.useState(program?.credentials?.[mkt.field] ?? '')
  const [active, setActive] = React.useState(program?.active ?? false)
  const [testResult, setTestResult] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    setValue(program?.credentials?.[mkt.field] ?? '')
    setActive(program?.active ?? false)
  }, [program])

  const saveMut = useMutation({
    mutationFn: () => {
      const creds = { [mkt.field]: value }
      if (program?.id) {
        return apiClient.patch(`/api/affiliates/programs/${program.id}`, {
          active,
          credentials: JSON.stringify(creds),
        }).then(r => r.data)
      } else {
        return apiClient.post('/api/affiliates/programs', {
          name: mkt.label,
          marketplace: mkt.id,
          active,
          credentials: JSON.stringify(creds),
        }).then(r => r.data)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates'] }),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao salvar')
    },
  })

  const handleTest = async () => {
    if (!value.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiClient.post('/api/affiliates/build-link', {
        product_url: 'https://www.amazon.com.br/dp/B08N5WRWNW',
        marketplace: mkt.id,
      })
      setTestResult(`Link gerado: ${(res.data.url as string)?.slice(0, 60)}...`)
    } catch {
      setTestResult('Falhou - verifique o ID/tag e tente novamente')
    } finally {
      setTesting(false)
    }
  }

  const isDirty =
    value !== (program?.credentials?.[mkt.field] ?? '') ||
    active !== (program?.active ?? false)

  const fmtRevenue = (n: number) =>
    n > 0 ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'

  const fmtSync = (s: string | null | undefined) => {
    if (!s) return '-'
    const diff = Date.now() - new Date(s).getTime()
    if (diff < 60_000) return 'agora'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
    return `${Math.floor(diff / 86_400_000)}d`
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
      {/* Programa */}
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-fg">{mkt.label}</p>
        <p className="text-xs text-fg-3">{mkt.id}</p>
      </td>

      {/* Tag / ID */}
      <td className="py-3 px-4">
        <div className="flex gap-2 items-center">
          <input
            className="w-40 text-sm border border-border rounded-md px-2 py-1 bg-surface text-fg outline-none focus:border-accent font-mono"
            placeholder={mkt.placeholder}
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        </div>
        {testResult && <p className="text-xs mt-1 text-fg-2">{testResult}</p>}
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="accent-accent"
          />
          <Badge variant={active ? 'success' : 'default'} size="sm">
            {active ? 'ativo' : 'inativo'}
          </Badge>
        </label>
      </td>

      {/* Cookie */}
      <td className="py-3 px-4 text-sm text-fg-2 text-center">-</td>

      {/* Cliques 30d */}
      <td className="py-3 px-4 text-sm text-fg text-right tabular-nums">
        {stats ? stats.clicks_30d.toLocaleString('pt-BR') : '-'}
      </td>

      {/* Conv. */}
      <td className="py-3 px-4 text-sm text-fg text-right tabular-nums">
        {stats ? stats.conversions_30d.toLocaleString('pt-BR') : '-'}
      </td>

      {/* Receita 30d */}
      <td className="py-3 px-4 text-sm text-fg text-right tabular-nums">
        {stats ? fmtRevenue(stats.revenue_30d) : '-'}
      </td>

      {/* Ultima sync */}
      <td className="py-3 px-4 text-sm text-fg-3 text-right">
        {stats ? fmtSync(stats.last_sync_at) : '-'}
      </td>

      {/* Ações */}
      <td className="py-3 px-4">
        <div className="flex gap-1.5 justify-end">
          <Button
            variant="ghost"
            size="sm"
            loading={testing}
            disabled={!value.trim()}
            onClick={handleTest}
          >
            Testar
          </Button>
          <Button
            variant={isDirty ? 'primary' : 'secondary'}
            size="sm"
            loading={saveMut.isPending}
            disabled={!isDirty && !saveMut.isSuccess}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isSuccess && !isDirty ? 'Salvo' : 'Salvar'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Tab: Programas
// ---------------------------------------------------------------------------

interface TabProgramsProps {
  programs: Program[]
  statsMap: Record<number, ProgramStats>
  isLoading: boolean
}

function TabPrograms({ programs, statsMap, isLoading }: TabProgramsProps) {
  const byMarketplace = React.useMemo(() => {
    const map: Record<string, Program> = {}
    for (const p of programs) map[p.marketplace] = p
    return map
  }, [programs])

  const statsForMkt = (mktId: string): ProgramStats | undefined => {
    const prog = byMarketplace[mktId]
    if (!prog?.id) return undefined
    return statsMap[prog.id]
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {MARKETPLACES.map(m => <Skeleton key={m.id} className="h-14 w-full" />)}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-xs text-fg-3 font-medium uppercase tracking-wide">
            <th className="py-2 px-4">Programa</th>
            <th className="py-2 px-4">Tag / ID</th>
            <th className="py-2 px-4">Status</th>
            <th className="py-2 px-4 text-center">Cookie</th>
            <th className="py-2 px-4 text-right">Cliques 30D</th>
            <th className="py-2 px-4 text-right">Conv.</th>
            <th className="py-2 px-4 text-right">Receita 30D</th>
            <th className="py-2 px-4 text-right">Ultima sync</th>
            <th className="py-2 px-4" />
          </tr>
        </thead>
        <tbody>
          {MARKETPLACES.map(mkt => (
            <AffiliateRow
              key={mkt.id}
              mkt={mkt}
              program={byMarketplace[mkt.id]}
              stats={statsForMkt(mkt.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Regras de mapeamento
// ---------------------------------------------------------------------------

function TabRules() {
  return (
    <div className="p-6">
      <EmptyState
        title="Regras de mapeamento"
        description="Configure regras para mapear domínios de origem a programas de afiliados automaticamente. Disponível em fase 2."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Postbacks (S2S)
// ---------------------------------------------------------------------------

function TabPostbacks() {
  return (
    <div className="p-6">
      <EmptyState
        title="Postbacks (S2S)"
        description="Receba conversões em tempo real via Server-to-Server postback. Configure a URL de postback por programa. Disponível em fase 2."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Atribuição & auditoria
// ---------------------------------------------------------------------------

function TabAttribution() {
  return (
    <div className="p-6">
      <EmptyState
        title="Atribuição & auditoria"
        description="Histórico de atribuições de cliques e conversões por usuário, programa e janela de cookie. Disponível em fase 2."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI row helpers
// ---------------------------------------------------------------------------

function buildStatsMap(statsList: ProgramStats[]): Record<number, ProgramStats> {
  const map: Record<number, ProgramStats> = {}
  for (const s of statsList) map[s.program_id] = s
  return map
}

function computeKpis(programs: Program[], statsMap: Record<number, ProgramStats>) {
  const activeCount = programs.filter(p => p.active).length
  const totalCount = programs.length

  let clicks = 0
  let conversions = 0
  let revenue = 0

  for (const s of Object.values(statsMap)) {
    clicks += s.clicks_30d
    conversions += s.conversions_30d
    revenue += s.revenue_30d
  }

  return { activeCount, totalCount, clicks, conversions, revenue }
}

function fmtRevenue(n: number) {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Affiliates() {
  const [activeTab, setActiveTab] = React.useState<TabId>('programs')

  const { data: programs = [], isLoading: loadingPrograms } = useQuery<Program[]>({
    queryKey: ['affiliates'],
    queryFn: () =>
      apiClient.get('/api/affiliates/programs').then(r => {
        const d = r.data
        const items: unknown[] = Array.isArray(d) ? d : (d?.items ?? [])
        return items.map((p: unknown) => {
          const prog = p as Record<string, unknown>
          return {
            ...prog,
            credentials:
              typeof prog.credentials === 'string'
                ? (() => {
                    try {
                      return JSON.parse(prog.credentials as string) as Record<string, string>
                    } catch {
                      return {}
                    }
                  })()
                : ((prog.credentials as Record<string, string>) ?? {}),
          } as Program
        })
      }).catch(() => []),
  })

  const { data: statsList = [] } = useQuery<ProgramStats[]>({
    queryKey: ['affiliates-stats'],
    queryFn: () =>
      apiClient
        .get('/api/affiliates/programs/stats')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    // poll every 60s to pick up backend when ready
    refetchInterval: 60_000,
  })

  const statsMap = React.useMemo(() => buildStatsMap(statsList), [statsList])
  const kpis = React.useMemo(() => computeKpis(programs, statsMap), [programs, statsMap])

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-fg">Afiliados</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Credenciais e tags por programa. Sem isso, link curto nao comissiona.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Programas ativos"
          value={loadingPrograms ? '-' : `${kpis.activeCount} / ${kpis.totalCount}`}
        />
        <KpiCard
          label="Cliques 30D"
          value={kpis.clicks > 0 ? kpis.clicks.toLocaleString('pt-BR') : '0'}
        />
        <KpiCard
          label="Conversoes 30D"
          value={kpis.conversions > 0 ? kpis.conversions.toLocaleString('pt-BR') : '0'}
          subtitle={
            kpis.clicks > 0
              ? `${((kpis.conversions / kpis.clicks) * 100).toFixed(1)}% conv. media`
              : undefined
          }
        />
        <KpiCard
          label="Receita 30D"
          value={fmtRevenue(kpis.revenue)}
        />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={TABS.map(t => ({ id: t.id, label: t.label }))}
        active={activeTab}
        onChange={id => setActiveTab(id as TabId)}
        className="mb-4"
      />

      {/* Tab content */}
      <div className="bg-surface border border-border rounded-md">
        {activeTab === 'programs' && (
          <TabPrograms
            programs={programs}
            statsMap={statsMap}
            isLoading={loadingPrograms}
          />
        )}
        {activeTab === 'rules' && <TabRules />}
        {activeTab === 'postbacks' && <TabPostbacks />}
        {activeTab === 'attribution' && <TabAttribution />}
      </div>
    </div>
  )
}
