import { useEffect, useState } from 'react'

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
  if (rate == null) return 'text-gray-400'
  if (rate >= 0.7) return 'text-green-600 font-semibold'
  if (rate >= 0.3) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function rateBg(rate?: number): string {
  if (rate == null) return ''
  if (rate >= 0.7) return 'bg-green-50'
  if (rate >= 0.3) return 'bg-yellow-50'
  return 'bg-red-50'
}

function statusBadge(status: string): string {
  switch (status) {
    case 'active':   return 'bg-green-100 text-green-800'
    case 'shadow':   return 'bg-blue-100 text-blue-800'
    case 'archived': return 'bg-gray-100 text-gray-500'
    default:         return 'bg-gray-100 text-gray-600'
  }
}

function fmt(rate?: number): string {
  if (rate == null) return '—'
  return (rate * 100).toFixed(1) + '%'
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminScrapers() {
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
      const r = await fetch('/api/admin/scrapers/health')
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
      const r = await fetch(url)
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
      const r = await fetch('/api/admin/scrapers/logs?' + params.toString())
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
      const r = await fetch(`/api/admin/scrapers/configs/${editModal.id}/selector`, {
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
    const r = await fetch(`/api/admin/scrapers/configs/${cfg.id}/promote`, { method: 'POST' })
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
    <div className="p-6 max-w-7xl space-y-10">
      <h1 className="text-2xl font-bold">Scrapers Admin</h1>

      {/* ── Section 1: Health ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Health (mv_scraper_health)</h2>
          <button
            onClick={loadHealth}
            className="text-xs px-3 py-1 rounded border hover:bg-gray-50"
          >
            Atualizar
          </button>
        </div>

        {healthLoading && <p className="text-gray-500 text-sm">Carregando health...</p>}

        {!healthLoading && (
          <div className="border rounded-lg bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Field</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Attempts</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Success Rate</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Computed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-gray-400 text-center">Nenhum dado</td></tr>
                )}
                {health.map((h, i) => (
                  <tr key={i} className={`hover:bg-gray-50 transition-colors ${rateBg(h.success_rate)}`}>
                    <td className="px-4 py-2 font-mono text-xs">{h.source_id}</td>
                    <td className="px-4 py-2 text-gray-700">{h.field}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{h.attempts}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${rateColor(h.success_rate)}`}>
                      {fmt(h.success_rate)}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{h.computed_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 2: Active Configs ──────────────────────────────────────── */}
      <section>
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
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'hover:bg-gray-50 border-gray-200',
                ].join(' ')}
              >
                {s || 'Todos'}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadConfigs(statusFilter)}
            className="text-xs px-3 py-1 rounded border hover:bg-gray-50 ml-auto"
          >
            Atualizar
          </button>
        </div>

        {configsLoading && <p className="text-gray-500 text-sm">Carregando configs...</p>}

        {!configsLoading && (
          <div className="border rounded-lg bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Field</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Ver.</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Selector</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Success %</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Created By</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Created At</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {configs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-4 text-gray-400 text-center">Nenhuma config encontrada</td></tr>
                )}
                {configs.map(cfg => (
                  <tr key={cfg.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs">{cfg.source_id}</td>
                    <td className="px-4 py-2 text-gray-700">{cfg.field}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{cfg.version}</td>
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
                    <td className="px-4 py-2 text-xs text-gray-500">{cfg.created_by}</td>
                    <td className="px-4 py-2 text-xs text-gray-400">{cfg.created_at}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(cfg)}
                          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          Editar selector
                        </button>
                        {cfg.status === 'shadow' && (
                          <button
                            onClick={() => promote(cfg)}
                            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
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
      </section>

      {/* ── Section 3: Extraction Logs ─────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Extraction Logs</h2>

        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Source ID</label>
            <select
              value={logSourceID}
              onChange={e => setLogSourceID(e.target.value)}
              className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[160px]"
            >
              <option value="">Todos</option>
              {allSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Field</label>
            <select
              value={logField}
              onChange={e => setLogField(e.target.value)}
              className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[120px]"
            >
              <option value="">Todos</option>
              {allFields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button
            onClick={() => loadLogs(logSourceID, logField)}
            disabled={logsLoading}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {logsLoading ? 'Carregando...' : 'Buscar'}
          </button>
        </div>

        {logs.length > 0 && (
          <div className="border rounded-lg bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">ID</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Field</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Config ID</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Result</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Error</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Attempted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className={`hover:bg-gray-50 transition-colors ${!log.extraction_successful ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400 text-xs">{log.id}</td>
                    <td className="px-4 py-2 font-mono text-xs">{log.source_id}</td>
                    <td className="px-4 py-2 text-gray-700">{log.field}</td>
                    <td className="px-4 py-2 text-xs text-gray-400 tabular-nums">{log.scraper_config_id ?? '—'}</td>
                    <td className="px-4 py-2">
                      {log.extraction_successful
                        ? <span className="text-green-600 font-medium text-xs">OK</span>
                        : <span className="text-red-600 font-medium text-xs">FAIL</span>}
                    </td>
                    <td className="px-4 py-2 max-w-xs">
                      {log.error_message
                        ? <span className="text-red-600 text-xs font-mono" title={log.error_message}>{truncate(log.error_message, 80)}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{log.attempted_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!logsLoading && logs.length === 0 && (
          <p className="text-gray-400 text-sm">Use os filtros acima e clique Buscar para carregar logs.</p>
        )}
      </section>

      {/* ── Modal: Edit Selector ───────────────────────────────────────────── */}
      {editModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg space-y-4">
            <h3 className="text-lg font-semibold">
              Editar selector — {editModal.source_id} / {editModal.field}
            </h3>
            <p className="text-xs text-gray-400">
              Config #{editModal.id} · version {editModal.version} · {editModal.status}
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Selector (cria nova version ao salvar)</label>
              <textarea
                value={editSelector}
                onChange={e => setEditSelector(e.target.value)}
                rows={5}
                className="border rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
                spellCheck={false}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditModal(null)}
                disabled={editSaving}
                className="px-4 py-2 text-sm rounded border hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveSelector}
                disabled={editSaving || !editSelector.trim()}
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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
