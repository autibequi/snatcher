import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { authFetch } from '../lib/authFetch'
import { rateColor as rateColorToken, statusBg } from '../lib/uiTokens'

const SOURCE_LABEL: Record<string, string> = {
  amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee',
  magazine_luiza: 'Magazine Luiza', magalu: 'Magazine Luiza',
  americanas: 'Americanas', aliexpress: 'AliExpress', awin: 'Awin', kinguin: 'Kinguin',
}
function sourceLabel(id: string) { return SOURCE_LABEL[id] ?? id }

// ── Types ────────────────────────────────────────────────────────────────────

interface ScraperConfig {
  id: number
  source_id: string
  field: string
  selector: string
  extractor?: string
  version: number
  status: 'active' | 'shadow' | 'archived'
  shadow_weight?: number
  success_rate?: number
  attempts: number
  created_by: string
  created_at: string
  promoted_at?: string
}

interface HealthRow {
  source_id: string
  field: string
  attempts: number
  success_rate?: number
  computed_at: string
}

interface ExtractionLog {
  id: number
  source_id: string
  field: string
  scraper_config_id?: number
  extraction_successful: boolean
  error_message?: string
  attempted_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rateColor(rate?: number): string {
  return rateColorToken(rate) + (rate != null ? ' font-semibold' : '')
}

function rateBg(rate?: number): string {
  if (rate == null) return ''
  if (rate >= 0.7) return statusBg('success')
  if (rate >= 0.3) return statusBg('warning')
  return 'bg-danger-soft'
}

function statusBadge(status: string): string {
  switch (status) {
    case 'active':   return 'bg-success-soft text-success'
    case 'shadow':   return 'bg-accent-soft text-accent'
    case 'archived': return 'bg-surface-2 text-fg-3'
    default:         return 'bg-surface-2 text-fg-2'
  }
}

function fmt(rate?: number): string {
  if (rate == null) return '—'
  return (rate * 100).toFixed(1) + '%'
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'health' | 'configs' | 'logs'

const VALID_TABS = new Set<Tab>(['health', 'configs', 'logs'])

const TABS: { id: Tab; label: string }[] = [
  { id: 'health',  label: 'Health' },
  { id: 'configs', label: 'Configs' },
  { id: 'logs',    label: 'Extraction Logs' },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminScrapers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam && VALID_TABS.has(tabParam as Tab) ? (tabParam as Tab) : 'health'

  const setTab = (t: Tab) => {
    setSearchParams(
      prev => {
        const p = new URLSearchParams(prev)
        if (t === 'health') p.delete('tab')
        else p.set('tab', t)
        return p
      },
      { replace: true },
    )
  }

  // Health
  const [health, setHealth] = useState<HealthRow[]>([])
  const [healthLoading, setHealthLoading] = useState(true)

  // Configs
  const [configs, setConfigs] = useState<ScraperConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')

  // Logs
  const [logs, setLogs] = useState<ExtractionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logSourceID, setLogSourceID] = useState('')
  const [logField, setLogField] = useState('')

  // Modal — edit selector
  const [editModal, setEditModal] = useState<ScraperConfig | null>(null)
  const [editSelector, setEditSelector] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadHealth = async () => {
    setHealthLoading(true)
    try {
      const r = await authFetch('/api/admin/scrapers/health')
      const data: HealthRow[] = await r.json()
      setHealth(data || [])
    } finally {
      setHealthLoading(false)
    }
  }

  const loadConfigs = async (status: string) => {
    setConfigsLoading(true)
    try {
      const url = '/api/admin/scrapers/configs' + (status ? `?status=${encodeURIComponent(status)}` : '')
      const r = await authFetch(url)
      const data: ScraperConfig[] = await r.json()
      setConfigs(data || [])
    } finally {
      setConfigsLoading(false)
    }
  }

  const loadLogs = async (sourceID: string, field: string) => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams()
      if (sourceID) params.set('source_id', sourceID)
      if (field) params.set('field', field)
      const r = await authFetch('/api/admin/scrapers/logs?' + params.toString())
      const data: ExtractionLog[] = await r.json()
      setLogs(data || [])
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => { loadHealth() }, [])
  useEffect(() => { loadConfigs(statusFilter) }, [statusFilter])

  // ── Actions ────────────────────────────────────────────────────────────────

  const openEdit = (cfg: ScraperConfig) => {
    setEditModal(cfg)
    setEditSelector(cfg.selector)
  }

  const saveSelector = async () => {
    if (!editModal) return
    if (!editSelector.trim()) { alert('Selector não pode ser vazio'); return }
    setEditSaving(true)
    try {
      const r = await authFetch(`/api/admin/scrapers/configs/${editModal.id}/selector`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: editSelector }),
      })
      if (!r.ok) {
        const txt = await r.text()
        alert('Erro ao salvar: ' + txt)
        return
      }
      setEditModal(null)
      loadConfigs(statusFilter)
    } finally {
      setEditSaving(false)
    }
  }

  const promote = async (cfg: ScraperConfig) => {
    if (!window.confirm(`Promover config #${cfg.id} (${cfg.source_id} / ${cfg.field}) de shadow para active?\n\nConfig active atual será arquivada.`)) return
    const r = await authFetch(`/api/admin/scrapers/configs/${cfg.id}/promote`, { method: 'POST' })
    if (!r.ok) {
      const txt = await r.text()
      alert('Erro ao promover: ' + txt)
      return
    }
    loadConfigs(statusFilter)
    loadHealth()
  }

  // Collect unique source_ids and fields from configs for log filter selects
  const allSources = Array.from(new Set(configs.map(c => c.source_id))).sort()
  const allFields  = Array.from(new Set(configs.map(c => c.field))).sort()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 space-y-6">
      <h1 className="text-2xl font-bold">Scrapers Admin</h1>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors shrink-0',
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-3 hover:text-fg',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Health ───────────────────────────────────────────────────── */}
      {tab === 'health' && <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Health (mv_scraper_health)</h2>
          <button
            onClick={loadHealth}
            className="text-xs px-3 py-1 rounded border hover:bg-surface-2"
          >
            Atualizar
          </button>
        </div>

        {healthLoading && <p className="text-fg-3 text-sm">Carregando health...</p>}

        {!healthLoading && (
          <div className="border rounded-lg bg-surface shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Field</th>
                  <th className="text-right px-4 py-2 font-medium text-fg-2">Attempts</th>
                  <th className="text-right px-4 py-2 font-medium text-fg-2">Success Rate</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Computed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {health.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-fg-4 text-center">Nenhum dado</td></tr>
                )}
                {health.map((h, i) => (
                  <tr key={i} className={`hover:bg-surface-2 transition-colors ${rateBg(h.success_rate)}`}>
                    <td className="px-4 py-2 text-xs" title={h.source_id}>{sourceLabel(h.source_id)}</td>
                    <td className="px-4 py-2 text-fg-2">{h.field}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{h.attempts}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${rateColor(h.success_rate)}`}>
                      {fmt(h.success_rate)}
                    </td>
                    <td className="px-4 py-2 text-xs text-fg-4">{h.computed_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {/* ── Tab: Configs ──────────────────────────────────────────────────── */}
      {tab === 'configs' && <section>
        <div className="flex items-center gap-4 mb-3">
          <h2 className="text-lg font-semibold">Configs</h2>
          <div className="flex gap-1">
            {(['active', 'shadow', 'archived', ''] as const).map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                className={[
                  'text-xs px-3 py-1 rounded border transition-colors',
                  statusFilter === s
                    ? 'bg-accent text-white border-accent'
                    : 'hover:bg-surface-2 border-border',
                ].join(' ')}
              >
                {s || 'Todos'}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadConfigs(statusFilter)}
            className="text-xs px-3 py-1 rounded border hover:bg-surface-2 ml-auto"
          >
            Atualizar
          </button>
        </div>

        {configsLoading && <p className="text-fg-3 text-sm">Carregando configs...</p>}

        {!configsLoading && (
          <div className="border rounded-lg bg-surface shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Field</th>
                  <th className="text-right px-4 py-2 font-medium text-fg-2">Ver.</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Selector</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-fg-2">Success %</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Created By</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Created At</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {configs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-4 text-fg-4 text-center">Nenhuma config encontrada</td></tr>
                )}
                {configs.map(cfg => (
                  <tr key={cfg.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2 text-xs" title={cfg.source_id}>{sourceLabel(cfg.source_id)}</td>
                    <td className="px-4 py-2 text-fg-2">{cfg.field}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg-3">{cfg.version}</td>
                    <td className="px-4 py-2 max-w-xs">
                      <span title={cfg.selector} className="font-mono text-xs">
                        {truncate(cfg.selector)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge(cfg.status)}`}>
                        {cfg.status}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${rateColor(cfg.success_rate)}`}>
                      {fmt(cfg.success_rate)}
                    </td>
                    <td className="px-4 py-2 text-xs text-fg-3">{cfg.created_by}</td>
                    <td className="px-4 py-2 text-xs text-fg-4">{cfg.created_at}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(cfg)}
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-2"
                        >
                          Editar selector
                        </button>
                        {cfg.status === 'shadow' && (
                          <button
                            onClick={() => promote(cfg)}
                            className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover"
                          >
                            Promover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {/* ── Tab: Logs ─────────────────────────────────────────────────────── */}
      {tab === 'logs' && <section>
        <h2 className="text-lg font-semibold mb-3">Extraction Logs</h2>

        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fg-3">Source ID</label>
            <select
              value={logSourceID}
              onChange={e => setLogSourceID(e.target.value)}
              className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent min-w-[160px]"
            >
              <option value="">Todos</option>
              {allSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fg-3">Field</label>
            <select
              value={logField}
              onChange={e => setLogField(e.target.value)}
              className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent min-w-[120px]"
            >
              <option value="">Todos</option>
              {allFields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button
            onClick={() => loadLogs(logSourceID, logField)}
            disabled={logsLoading}
            className="px-4 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {logsLoading ? 'Carregando...' : 'Buscar'}
          </button>
        </div>

        {logs.length > 0 && (
          <div className="border rounded-lg bg-surface shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b">
                <tr>
                  <th className="text-right px-4 py-2 font-medium text-fg-2">ID</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Field</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Config ID</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Result</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Error</th>
                  <th className="text-left px-4 py-2 font-medium text-fg-2">Attempted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map(log => (
                  <tr key={log.id} className={`hover:bg-surface-2 transition-colors ${!log.extraction_successful ? 'bg-danger-soft' : ''}`}>
                    <td className="px-4 py-2 text-right tabular-nums text-fg-4 text-xs">{log.id}</td>
                    <td className="px-4 py-2 text-xs" title={log.source_id}>{sourceLabel(log.source_id)}</td>
                    <td className="px-4 py-2 text-fg-2">{log.field}</td>
                    <td className="px-4 py-2 text-xs text-fg-4 tabular-nums">{log.scraper_config_id ?? '—'}</td>
                    <td className="px-4 py-2">
                      {log.extraction_successful
                        ? <span className="text-success font-medium text-xs">OK</span>
                        : <span className="text-danger font-medium text-xs">FAIL</span>}
                    </td>
                    <td className="px-4 py-2 max-w-xs">
                      {log.error_message
                        ? <span className="text-danger text-xs font-mono" title={log.error_message}>{truncate(log.error_message, 80)}</span>
                        : <span className="text-fg-4 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-fg-4">{log.attempted_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!logsLoading && logs.length === 0 && (
          <p className="text-fg-4 text-sm">Use os filtros acima e clique Buscar para carregar logs.</p>
        )}
      </section>}

      {/* ── Modal: Edit Selector ───────────────────────────────────────────── */}
      {editModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}
        >
          <div className="bg-surface rounded-xl shadow-2xl px-3 py-4 sm:px-4 sm:py-6 w-full max-w-lg space-y-4">
            <h3 className="text-lg font-semibold">
              Editar selector — {editModal.source_id} / {editModal.field}
            </h3>
            <p className="text-xs text-fg-4">
              Config #{editModal.id} · version {editModal.version} · {editModal.status}
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-fg-2">Selector (cria nova version ao salvar)</label>
              <textarea
                value={editSelector}
                onChange={e => setEditSelector(e.target.value)}
                rows={5}
                className="border rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                spellCheck={false}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditModal(null)}
                disabled={editSaving}
                className="px-4 py-2 text-sm rounded border hover:bg-surface-2 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveSelector}
                disabled={editSaving || !editSelector.trim()}
                className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {editSaving ? 'Salvando...' : 'Salvar (cria nova version)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
