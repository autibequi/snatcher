import { useState, useEffect } from 'react'
import { authFetch } from '../lib/authFetch'

// ---------- types ----------

interface ConversionByGroup {
  group_id: number | null
  conversions: number
  revenue: number
  commission: number
}

interface ConversionByDay {
  date: string
  count: number
  revenue: number
  commission: number
}

interface ConversionBySource {
  source_id: string
  count: number
  revenue: number
  commission: number
}

interface RecentConversion {
  id: number
  short_id: string
  catalog_id?: number
  group_name?: string
  source_id: string
  order_value?: number
  commission?: number
  currency: string
  status: string
  occurred_at: string
}

// ---------- helpers ----------

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (s: string) => s.slice(0, 10)

const statusColor: Record<string, string> = {
  confirmed: 'text-green-400',
  pending:   'text-yellow-400',
  cancelled: 'text-red-400',
  rejected:  'text-red-500',
}

// ---------- KPI card ----------

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-1 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-fg-3">{label}</p>
      <p className="text-xl font-semibold text-fg truncate">{value}</p>
    </div>
  )
}

// ---------- mini bar ----------

function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="w-16 h-2 bg-surface rounded overflow-hidden">
      <div className="h-full bg-accent/60" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ---------- main ----------

export default function AdminConversions() {
  const [days, setDays] = useState(30)
  const [byGroup, setByGroup] = useState<ConversionByGroup[]>([])
  const [byDay, setByDay] = useState<ConversionByDay[]>([])
  const [bySource, setBySource] = useState<ConversionBySource[]>([])
  const [recent, setRecent] = useState<RecentConversion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      authFetch(`/api/admin/conversions/by-group?days=${days}`).then(r => r.json()),
      authFetch(`/api/admin/conversions/by-day?days=${days}`).then(r => r.json()),
      authFetch(`/api/admin/conversions/by-source?days=${days}`).then(r => r.json()),
      authFetch(`/api/admin/conversions/recent?limit=50`).then(r => r.json()),
    ])
      .then(([g, d, s, rec]) => {
        setByGroup(Array.isArray(g) ? g : [])
        setByDay(Array.isArray(d) ? d : [])
        setBySource(Array.isArray(s) ? s : [])
        setRecent(Array.isArray(rec) ? rec : [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [days])

  // KPI aggregates
  const totalCount = byDay.reduce((a, r) => a + r.count, 0)
  const totalRevenue = byDay.reduce((a, r) => a + r.revenue, 0)
  const totalCommission = byDay.reduce((a, r) => a + r.commission, 0)
  const epc = totalCount > 0 ? totalCommission / totalCount : 0

  const maxDayRevenue = Math.max(1, ...byDay.map(r => r.revenue))
  const maxGroupCommission = Math.max(1, ...byGroup.map(r => r.commission))

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-fg">Conversoes — receita real</h1>
          <p className="text-sm text-fg-3 mt-0.5">Dados de conversoes registradas no sistema</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-surface-2 border border-border text-fg text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value={7}>Ultimos 7 dias</option>
          <option value={30}>Ultimos 30 dias</option>
          <option value={90}>Ultimos 90 dias</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          Erro ao carregar dados: {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Total conversoes" value={totalCount.toLocaleString('pt-BR')} />
            <KpiCard label="Receita total" value={brl(totalRevenue)} />
            <KpiCard label="Comissao total" value={brl(totalCommission)} />
            <KpiCard label="EPC medio" value={brl(epc)} />
          </div>

          {/* Por dia */}
          <section>
            <h2 className="text-sm font-semibold text-fg mb-3">Por dia</h2>
            {byDay.length === 0 ? (
              <p className="text-sm text-fg-3">Sem dados no periodo.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                      <th className="px-4 py-2.5 font-medium">Dia</th>
                      <th className="px-4 py-2.5 font-medium text-right">Conversoes</th>
                      <th className="px-4 py-2.5 font-medium text-right">Receita</th>
                      <th className="px-4 py-2.5 font-medium text-right">Comissao</th>
                      <th className="px-4 py-2.5 font-medium">Rel.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDay.map(row => (
                      <tr key={row.date} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-2 font-mono text-fg">{fmtDate(row.date)}</td>
                        <td className="px-4 py-2 text-right text-fg">{row.count.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right text-fg">{brl(row.revenue)}</td>
                        <td className="px-4 py-2 text-right text-accent">{brl(row.commission)}</td>
                        <td className="px-4 py-2">
                          <MiniBar pct={(row.revenue / maxDayRevenue) * 100} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Por source */}
          <section>
            <h2 className="text-sm font-semibold text-fg mb-3">Por source</h2>
            {bySource.length === 0 ? (
              <p className="text-sm text-fg-3">Sem dados no periodo.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                      <th className="px-4 py-2.5 font-medium">Source</th>
                      <th className="px-4 py-2.5 font-medium text-right">Conversoes</th>
                      <th className="px-4 py-2.5 font-medium text-right">Receita</th>
                      <th className="px-4 py-2.5 font-medium text-right">Comissao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map(row => (
                      <tr key={row.source_id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-2 font-mono text-fg">{row.source_id}</td>
                        <td className="px-4 py-2 text-right text-fg">{row.count.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right text-fg">{brl(row.revenue)}</td>
                        <td className="px-4 py-2 text-right text-accent">{brl(row.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Por grupo (top 10) */}
          <section>
            <h2 className="text-sm font-semibold text-fg mb-3">Por grupo (top 10)</h2>
            {byGroup.length === 0 ? (
              <p className="text-sm text-fg-3">Sem dados no periodo.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                      <th className="px-4 py-2.5 font-medium">Grupo ID</th>
                      <th className="px-4 py-2.5 font-medium text-right">Conversoes</th>
                      <th className="px-4 py-2.5 font-medium text-right">Receita</th>
                      <th className="px-4 py-2.5 font-medium text-right">Comissao</th>
                      <th className="px-4 py-2.5 font-medium">Rel.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byGroup.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-2 text-fg">{row.group_id ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-fg">{row.conversions.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right text-fg">{brl(row.revenue)}</td>
                        <td className="px-4 py-2 text-right text-accent">{brl(row.commission)}</td>
                        <td className="px-4 py-2">
                          <MiniBar pct={(row.commission / maxGroupCommission) * 100} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Ultimas 50 */}
          <section>
            <h2 className="text-sm font-semibold text-fg mb-3">Ultimas 50 conversoes</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-fg-3">Nenhuma conversao registrada.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-fg-3 text-left">
                      <th className="px-4 py-2.5 font-medium">Data</th>
                      <th className="px-4 py-2.5 font-medium">Source</th>
                      <th className="px-4 py-2.5 font-medium">Grupo</th>
                      <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                      <th className="px-4 py-2.5 font-medium text-right">Comissao</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Short ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(row => (
                      <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-2 font-mono text-fg-2 whitespace-nowrap">{fmtDate(row.occurred_at)}</td>
                        <td className="px-4 py-2 font-mono text-fg">{row.source_id}</td>
                        <td className="px-4 py-2 text-fg-2">{row.group_name ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-fg">{row.order_value != null ? brl(row.order_value) : '—'}</td>
                        <td className="px-4 py-2 text-right text-accent">{row.commission != null ? brl(row.commission) : '—'}</td>
                        <td className={`px-4 py-2 capitalize ${statusColor[row.status] ?? 'text-fg-2'}`}>{row.status}</td>
                        <td className="px-4 py-2 font-mono text-fg-3 text-xs">{row.short_id.slice(0, 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
