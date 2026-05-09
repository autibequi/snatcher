import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, KpiCard, Skeleton } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ---------------------------------------------------------------------------
// Types — catálogo de marketplaces vem só do backend (enum único).
// ---------------------------------------------------------------------------

interface MarketplaceRow {
  id: string
  label: string
  credential_field: string
  placeholder: string
  hint: string
  test_product_url: string
}

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

// ---------------------------------------------------------------------------
// AffiliateRow
// ---------------------------------------------------------------------------

interface AffiliateRowProps {
  mkt: MarketplaceRow
  program?: Program
  stats?: ProgramStats
}

function AffiliateRow({ mkt, program, stats }: AffiliateRowProps) {
  const qc = useQueryClient()
  const credKey = mkt.credential_field
  const [value, setValue] = React.useState(program?.credentials?.[credKey] ?? '')
  const [active, setActive] = React.useState(program?.active ?? false)
  const [testResult, setTestResult] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    setValue(program?.credentials?.[credKey] ?? '')
    setActive(program?.active ?? false)
  }, [program, credKey])

  const saveMut = useMutation({
    mutationFn: () => {
      const creds = { [credKey]: value }
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
        product_url: mkt.test_product_url || 'https://www.amazon.com.br/dp/B08N5WRWNW',
        marketplace: mkt.id,
      })
      const u = (res.data as { url?: string })?.url ?? ''
      setTestResult(u ? `Link gerado: ${u.slice(0, 72)}…` : 'Sem URL na resposta')
    } catch {
      setTestResult('Falhou - verifique o ID/tag e tente novamente')
    } finally {
      setTesting(false)
    }
  }

  const isDirty =
    value !== (program?.credentials?.[credKey] ?? '') ||
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
// Tabela de programas
// ---------------------------------------------------------------------------

interface ProgramsTableProps {
  catalog: MarketplaceRow[]
  programs: Program[]
  statsMap: Record<number, ProgramStats>
  isLoading: boolean
}

function ProgramsTable({ catalog, programs, statsMap, isLoading }: ProgramsTableProps) {
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
    const n = catalog.length > 0 ? catalog.length : 8
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: n }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (catalog.length === 0) {
    return (
      <p className="p-4 text-sm text-fg-3">
        Catálogo de marketplaces indisponível (GET /api/affiliates/marketplace-catalog).
      </p>
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
          {catalog.map(mkt => (
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
  const { data: marketplaceCatalog = [], isLoading: loadingCatalog } = useQuery<MarketplaceRow[]>({
    queryKey: ['affiliates-marketplace-catalog'],
    queryFn: () =>
      apiClient
        .get('/api/affiliates/marketplace-catalog')
        .then(r => {
          const raw = r.data as { marketplaces?: MarketplaceRow[] }
          return Array.isArray(raw?.marketplaces) ? raw.marketplaces : []
        })
        .catch(() => []),
    staleTime: Infinity,
  })

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

      <div className="bg-surface border border-border rounded-md">
        <ProgramsTable
          catalog={marketplaceCatalog}
          programs={programs}
          statsMap={statsMap}
          isLoading={loadingPrograms || loadingCatalog}
        />
      </div>
    </div>
  )
}
