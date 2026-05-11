import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Input,
  KpiCard,
  Modal,
  PageHeader,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
} from '../components/ui'
import { apiClient } from '../lib/apiClient'
import {
  pageContainer,
  responsiveKpiGrid,
  sectionCard,
  sectionTitle,
  tableContainer,
  tableHeaderCell,
  tableRow,
  tableCell,
  tableCellMuted,
  formGroup,
  formLabel,
  formHint,
} from '../lib/uiTokens'

// ---------------------------------------------------------------------------
// Types
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
  name?: string
  marketplace: string
  active: boolean
  credentials: Record<string, string>
  postback_url?: string
  postback_secret?: string
  priority?: number
}

interface ProgramStats {
  program_id: number
  clicks_30d: number
  conversions_30d: number
  revenue_30d: number
  last_sync_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRevenue(n: number) {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function fmtSync(s: string | null | undefined) {
  if (!s) return '-'
  const diff = Date.now() - new Date(s).getTime()
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

function maskCred(val: string | undefined) {
  if (!val) return '-'
  if (val.length <= 4) return '****'
  return val.slice(0, 4) + '****'
}

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

// ---------------------------------------------------------------------------
// Program modal — tabs: Credenciais | Regras | Postback
// ---------------------------------------------------------------------------

interface ProgramModalProps {
  open: boolean
  onClose: () => void
  mkt: MarketplaceRow | null
  program?: Program
  onSaved: () => void
}

function ProgramModal({ open, onClose, mkt, program, onSaved }: ProgramModalProps) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = React.useState('credentials')
  const credKey = mkt?.credential_field ?? 'tag'

  const [cred, setCred] = React.useState(program?.credentials?.[credKey] ?? '')
  const [apiKey, setApiKey] = React.useState(program?.credentials?.apiKey ?? '')
  const [apiSecret, setApiSecret] = React.useState(program?.credentials?.apiSecret ?? '')
  const [affiliateId, setAffiliateId] = React.useState(program?.credentials?.affiliateId ?? '')
  const [active, setActive] = React.useState(program?.active ?? true)
  const [priority, setPriority] = React.useState(String(program?.priority ?? 50))
  const [postbackUrl, setPostbackUrl] = React.useState(program?.postback_url ?? '')
  const [postbackSecret, setPostbackSecret] = React.useState(program?.postback_secret ?? '')

  // Reset when opening a different program
  React.useEffect(() => {
    if (open) {
      setActiveTab('credentials')
      setCred(program?.credentials?.[credKey] ?? '')
      setApiKey(program?.credentials?.apiKey ?? '')
      setApiSecret(program?.credentials?.apiSecret ?? '')
      setAffiliateId(program?.credentials?.affiliateId ?? '')
      setActive(program?.active ?? true)
      setPriority(String(program?.priority ?? 50))
      setPostbackUrl(program?.postback_url ?? '')
      setPostbackSecret(program?.postback_secret ?? '')
    }
  }, [open, program, credKey])

  const saveMut = useMutation({
    mutationFn: () => {
      if (!mkt) throw new Error('marketplace nao selecionado')
      const credentials = JSON.stringify({
        [credKey]: cred,
        apiKey,
        apiSecret,
        affiliateId,
      })
      const body = {
        name: mkt.label,
        marketplace: mkt.id,
        active,
        credentials,
        postback_url: postbackUrl,
        postback_secret: postbackSecret,
        priority: Number(priority),
      }
      if (program?.id) {
        return apiClient.patch(`/api/affiliates/programs/${program.id}`, body).then(r => r.data)
      }
      return apiClient.post('/api/affiliates/programs', body).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affiliates'] })
      onSaved()
      onClose()
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao salvar')
    },
  })

  const tabs = [
    { id: 'credentials', label: 'Credenciais' },
    { id: 'rules', label: 'Regras' },
    { id: 'postback', label: 'Postback S2S' },
  ]

  const title = program?.id
    ? `Editar programa — ${mkt?.label ?? ''}`
    : 'Novo programa de afiliado'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      panelClassName="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            Salvar
          </Button>
        </>
      }
    >
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="mb-4" />

      {activeTab === 'credentials' && (
        <div className="space-y-4">
          <div className={formGroup}>
            <label className={formLabel}>
              {credKey === 'tag' ? 'Tag / Tracking ID' : 'ID de afiliado'}
            </label>
            <Input
              type="password"
              placeholder={mkt?.placeholder ?? ''}
              value={cred}
              onChange={e => setCred(e.target.value)}
            />
            {mkt?.hint && <p className={formHint}>{mkt.hint}</p>}
          </div>
          <div className={formGroup}>
            <label className={formLabel}>API Key</label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>API Secret</label>
            <Input
              type="password"
              placeholder="secret..."
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Affiliate ID</label>
            <Input
              placeholder="ID no programa"
              value={affiliateId}
              onChange={e => setAffiliateId(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <span className={formLabel}>Programa ativo</span>
            <Switch checked={active} onChange={setActive} />
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-4">
          <p className="text-sm text-fg-3">
            Prioridade usada quando o mesmo produto existe em multiplos marketplaces conectados.
            Valor mais alto = preferido. Default: 50.
          </p>
          <div className={formGroup}>
            <label className={formLabel}>Prioridade (0–100)</label>
            <Input
              type="number"
              min="0"
              max="100"
              value={priority}
              onChange={e => setPriority(e.target.value)}
            />
            <p className={formHint}>
              100 = sempre preferido. 0 = ultimo recurso.
            </p>
          </div>
          <div className={`${sectionCard} text-sm text-fg-2 space-y-2`}>
            <p className={sectionTitle}>Regras aplicadas automaticamente</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-fg-3">
              <li>Marketplace direto com programa conectado tem precedencia.</li>
              <li>Redes de afiliados (AWIN, Lomadee) como fallback.</li>
              <li>Override manual por produto (raro).</li>
              <li>Link nu sem tag se nenhuma regra bater (alerta gerado).</li>
            </ol>
          </div>
        </div>
      )}

      {activeTab === 'postback' && (
        <div className="space-y-4">
          <p className="text-sm text-fg-3">
            Configure no painel do programa a URL abaixo para que o Snatcher receba confirmacao
            de cliques e conversoes (S2S).
          </p>
          <div className={`${sectionCard} font-mono text-xs text-fg-2 break-all`}>
            {`POST /postback/${mkt?.id ?? '{program}'}`}
          </div>
          <div className={formGroup}>
            <label className={formLabel}>URL de callback (opcional)</label>
            <Input
              placeholder="https://..."
              value={postbackUrl}
              onChange={e => setPostbackUrl(e.target.value)}
            />
            <p className={formHint}>
              Endpoint customizado para receber postbacks deste programa.
            </p>
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Secret Token</label>
            <Input
              type="password"
              placeholder="token de verificacao HMAC"
              value={postbackSecret}
              onChange={e => setPostbackSecret(e.target.value)}
            />
            <p className={formHint}>
              Usado para validar a assinatura dos postbacks recebidos.
            </p>
          </div>
          <div className={`${sectionCard} text-xs text-fg-3`}>
            <p className={`${formLabel} mb-1`}>Payload esperado pelo Snatcher</p>
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">{`{
  "click_id": "ck_a8f3...",
  "event": "conversion",
  "order_value": 89.90,
  "commission": 8.99,
  "currency": "BRL",
  "timestamp": "2026-05-04T14:32:08Z",
  "external_id": "AMZ-ORD-1234"
}`}</pre>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Program card row
// ---------------------------------------------------------------------------

interface ProgramRowProps {
  mkt: MarketplaceRow
  program?: Program
  stats?: ProgramStats
  onEdit: (mkt: MarketplaceRow, program?: Program) => void
}

function ProgramRow({ mkt, program, stats, onEdit }: ProgramRowProps) {
  const qc = useQueryClient()
  const credKey = mkt.credential_field

  const toggleMut = useMutation({
    mutationFn: () => {
      if (!program?.id) return Promise.resolve(null)
      return apiClient
        .patch(`/api/affiliates/programs/${program.id}`, { active: !program.active })
        .then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates'] }),
  })

  const hasCred = Boolean(program?.credentials?.[credKey])
  const convRate =
    stats && stats.clicks_30d > 0
      ? `${((stats.conversions_30d / stats.clicks_30d) * 100).toFixed(1)}%`
      : '-'

  return (
    <tr className={tableRow}>
      {/* Programa */}
      <td className={tableCell}>
        <p className="font-medium text-fg">{mkt.label}</p>
        <p className="text-xs text-fg-3">{mkt.id}</p>
      </td>

      {/* Credencial (mascarada) */}
      <td className={`${tableCell} font-mono`}>
        {hasCred ? (
          <span className="text-fg-2">{maskCred(program?.credentials?.[credKey])}</span>
        ) : (
          <span className="text-fg-3 italic">nao configurado</span>
        )}
      </td>

      {/* Status */}
      <td className={tableCell}>
        {program ? (
          <Badge variant={program.active ? 'success' : 'default'} size="sm">
            {program.active ? 'ativo' : 'inativo'}
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            sem programa
          </Badge>
        )}
      </td>

      {/* Cliques 30d */}
      <td className={`${tableCell} text-right tabular-nums`}>
        {stats ? stats.clicks_30d.toLocaleString('pt-BR') : '-'}
      </td>

      {/* Conv. */}
      <td className={`${tableCell} text-right tabular-nums`}>{convRate}</td>

      {/* Receita 30d */}
      <td className={`${tableCell} text-right tabular-nums`}>
        {stats ? fmtRevenue(stats.revenue_30d) : '-'}
      </td>

      {/* Ultima sync */}
      <td className={`${tableCellMuted} text-right`}>
        {stats ? fmtSync(stats.last_sync_at) : '-'}
      </td>

      {/* Acoes */}
      <td className={tableCell}>
        <div className="flex gap-1.5 justify-end">
          {program?.id && (
            <Button
              variant="ghost"
              size="sm"
              loading={toggleMut.isPending}
              onClick={() => toggleMut.mutate()}
            >
              {program.active ? 'Pausar' : 'Ativar'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onEdit(mkt, program)}>
            {program ? 'Editar' : 'Configurar'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Programs table
// ---------------------------------------------------------------------------

interface ProgramsTableProps {
  catalog: MarketplaceRow[]
  programs: Program[]
  statsMap: Record<number, ProgramStats>
  isLoading: boolean
  onEdit: (mkt: MarketplaceRow, program?: Program) => void
}

function ProgramsTable({ catalog, programs, statsMap, isLoading, onEdit }: ProgramsTableProps) {
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
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (catalog.length === 0) {
    return (
      <p className="p-6 text-sm text-fg-3">
        Catalogo de marketplaces indisponivel. Verifique GET /api/affiliates/marketplace-catalog.
      </p>
    )
  }

  return (
    <div className={tableContainer}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className={tableHeaderCell}>Programa</th>
            <th className={tableHeaderCell}>Credencial</th>
            <th className={tableHeaderCell}>Status</th>
            <th className={`${tableHeaderCell} text-right`}>Cliques 30d</th>
            <th className={`${tableHeaderCell} text-right`}>Conv.</th>
            <th className={`${tableHeaderCell} text-right`}>Receita 30d</th>
            <th className={`${tableHeaderCell} text-right`}>Ultima sync</th>
            <th className={tableHeaderCell} />
          </tr>
        </thead>
        <tbody>
          {catalog.map(mkt => (
            <ProgramRow
              key={mkt.id}
              mkt={mkt}
              program={byMarketplace[mkt.id]}
              stats={statsForMkt(mkt.id)}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Affiliates() {
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editMkt, setEditMkt] = React.useState<MarketplaceRow | null>(null)
  const [editProgram, setEditProgram] = React.useState<Program | undefined>(undefined)

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
      apiClient
        .get('/api/affiliates/programs')
        .then(r => {
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
        })
        .catch(() => []),
  })

  const { data: statsList = [] } = useQuery<ProgramStats[]>({
    queryKey: ['affiliates-stats'],
    queryFn: () =>
      apiClient
        .get('/api/affiliates/programs/stats')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 60_000,
  })

  const statsMap = React.useMemo(() => buildStatsMap(statsList), [statsList])
  const kpis = React.useMemo(() => computeKpis(programs, statsMap), [programs, statsMap])

  function openNewProgram() {
    // If only one marketplace in catalog, pre-select it; otherwise open with null
    setEditMkt(marketplaceCatalog.length === 1 ? marketplaceCatalog[0] : null)
    setEditProgram(undefined)
    setModalOpen(true)
  }

  function openEditProgram(mkt: MarketplaceRow, program?: Program) {
    setEditMkt(mkt)
    setEditProgram(program)
    setModalOpen(true)
  }

  // When catalog has items but modal open with null mkt, default to first
  const resolvedMkt =
    editMkt ?? (marketplaceCatalog.length > 0 ? marketplaceCatalog[0] : null)

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Afiliados"
        subtitle="Credenciais e tags por programa. Sem isso, links nao comissionam."
        className="mb-6"
        actions={
          <Button onClick={openNewProgram} leftIcon={<PlusIcon />}>
            Novo programa
          </Button>
        }
      />

      {/* KPIs */}
      <div className={`${responsiveKpiGrid} mb-6`}>
        <KpiCard
          label="Programas ativos"
          value={
            loadingPrograms ? '-' : `${kpis.activeCount} / ${kpis.totalCount}`
          }
        />
        <KpiCard
          label="Cliques 30d"
          value={kpis.clicks > 0 ? kpis.clicks.toLocaleString('pt-BR') : '0'}
        />
        <KpiCard
          label="Conversoes 30d"
          value={kpis.conversions > 0 ? kpis.conversions.toLocaleString('pt-BR') : '0'}
          subtitle={
            kpis.clicks > 0
              ? `${((kpis.conversions / kpis.clicks) * 100).toFixed(1)}% conv. media`
              : undefined
          }
        />
        <KpiCard label="Receita 30d" value={fmtRevenue(kpis.revenue)} />
      </div>

      {/* Programs table */}
      <ProgramsTable
        catalog={marketplaceCatalog}
        programs={programs}
        statsMap={statsMap}
        isLoading={loadingPrograms || loadingCatalog}
        onEdit={openEditProgram}
      />

      {/* Modal */}
      <ProgramModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mkt={resolvedMkt}
        program={editProgram}
        onSaved={() => {}}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons (inline to avoid extra deps)
// ---------------------------------------------------------------------------

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
