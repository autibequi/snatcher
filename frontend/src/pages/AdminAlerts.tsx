import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'

interface AlertRule {
  id: number
  name: string
  query: string
  severity: 'critical' | 'warning'
  cooldown_min: number
  enabled: boolean
  last_fired_at?: string
}

interface TestResult {
  count: number
  samples: Record<string, unknown>[]
}

const EMPTY_RULE: Omit<AlertRule, 'id'> = {
  name: '',
  query: '',
  severity: 'warning',
  cooldown_min: 60,
  enabled: true,
}

function humanize(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'critical'
      ? 'bg-red-100 text-red-800'
      : 'bg-yellow-100 text-yellow-800'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {severity}
    </span>
  )
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        value ? 'bg-green-500' : 'bg-gray-300',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
      aria-label={value ? 'Desativar' : 'Ativar'}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

export default function AdminAlerts() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AlertRule | null>(null)
  const [form, setForm] = useState<Omit<AlertRule, 'id'>>(EMPTY_RULE)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await authFetch('/api/admin/alert-rules')
      const data = await r.json()
      setRules(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_RULE)
    setTestResult(null)
    setTestError(null)
    setModalOpen(true)
  }

  const openEdit = (rule: AlertRule) => {
    setEditing(rule)
    setForm({
      name: rule.name,
      query: rule.query,
      severity: rule.severity,
      cooldown_min: rule.cooldown_min,
      enabled: rule.enabled,
    })
    setTestResult(null)
    setTestError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setTestResult(null)
    setTestError(null)
  }

  const handleDelete = async (rule: AlertRule) => {
    if (!window.confirm(`Excluir a regra "${rule.name}"? Esta ação não pode ser desfeita.`)) return
    await authFetch(`/api/admin/alert-rules/${rule.id}`, { method: 'DELETE' })
    await load()
  }

  const handleToggleEnabled = async (rule: AlertRule) => {
    await authFetch(`/api/admin/alert-rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    })
    await load()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        const r = await authFetch(`/api/admin/alert-rules/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }))
          alert(`Erro ao salvar: ${err.error || r.statusText}`)
          return
        }
      } else {
        const r = await authFetch('/api/admin/alert-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }))
          alert(`Erro ao criar: ${err.error || r.statusText}`)
          return
        }
      }
      closeModal()
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleTestQuery = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const r = await authFetch('/api/admin/alert-rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: form.query }),
      })
      if (!r.ok) {
        const text = await r.text()
        setTestError(text || r.statusText)
        return
      }
      const data: TestResult = await r.json()
      setTestResult(data)
    } catch (e) {
      setTestError(String(e))
    } finally {
      setTesting(false)
    }
  }

  const sampleColumns =
    testResult && testResult.samples.length > 0
      ? Object.keys(testResult.samples[0])
      : []

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Alert Rules</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
        >
          + Nova regra
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-5 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900">
        <strong>Regras SQL</strong> — quando retornam linhas, alerta dispara via curator.{' '}
        <span className="inline-block px-2 py-0.5 rounded bg-green-200 text-green-900 font-mono text-xs">
          verde se vazio
        </span>{' '}
        <span className="inline-block px-2 py-0.5 rounded bg-red-200 text-red-900 font-mono text-xs">
          vermelho se com linhas
        </span>
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && rules.length === 0 && (
        <p className="text-gray-400">Nenhuma regra cadastrada.</p>
      )}

      {/* Table */}
      {!loading && rules.length > 0 && (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Severity</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Cooldown</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Enabled</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 hidden md:table-cell">
                  Último disparo
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map(rule => (
                <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-800 font-mono text-xs">
                    {rule.name}
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={rule.severity} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{rule.cooldown_min} min</td>
                  <td className="px-4 py-3">
                    <Toggle value={rule.enabled} onChange={() => handleToggleEnabled(rule)} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                    {humanize(rule.last_fired_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(rule)}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded font-medium"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">
                {editing ? 'Editar regra' : 'Nova regra'}
              </h2>

              <div className="space-y-4">
                {/* Nome */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: ban_rate_24h"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
                  />
                </div>

                {/* Query SQL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Query SQL
                  </label>
                  <textarea
                    value={form.query}
                    onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
                    rows={6}
                    placeholder="SELECT ... FROM ... WHERE ..."
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono resize-y"
                  />
                </div>

                {/* Botão testar query */}
                <div>
                  <button
                    type="button"
                    onClick={handleTestQuery}
                    disabled={testing || !form.query.trim()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded text-sm font-medium"
                  >
                    {testing ? 'Testando...' : 'Testar query'}
                  </button>
                </div>

                {/* Resultado do teste — erro */}
                {testError && (
                  <div className="border border-red-300 bg-red-50 rounded p-3 text-sm text-red-800 font-mono whitespace-pre-wrap">
                    {testError}
                  </div>
                )}

                {/* Resultado do teste — sucesso */}
                {testResult && !testError && (
                  <div className="border rounded p-3 text-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          'inline-block px-2 py-0.5 rounded text-xs font-medium',
                          testResult.count === 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800',
                        ].join(' ')}
                      >
                        {testResult.count} linha{testResult.count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {testResult.count === 0
                          ? 'Nenhum alerta seria disparado.'
                          : 'Alerta seria disparado!'}
                      </span>
                    </div>
                    {testResult.samples.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-gray-50">
                              {sampleColumns.map(col => (
                                <th
                                  key={col}
                                  className="px-2 py-1 text-left font-medium text-gray-600 border-b"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {testResult.samples.map((row, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                {sampleColumns.map(col => (
                                  <td key={col} className="px-2 py-1 text-gray-700">
                                    {row[col] == null ? (
                                      <span className="text-gray-400">null</span>
                                    ) : (
                                      String(row[col])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {testResult.count > 10 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Mostrando 10 de {testResult.count} linhas.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Severity + Cooldown */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                    <select
                      value={form.severity}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          severity: e.target.value as 'critical' | 'warning',
                        }))
                      }
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="warning">warning</option>
                      <option value="critical">critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cooldown (min)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.cooldown_min}
                      onChange={e =>
                        setForm(f => ({ ...f, cooldown_min: parseInt(e.target.value) || 60 }))
                      }
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center gap-3">
                  <Toggle
                    value={form.enabled}
                    onChange={v => setForm(f => ({ ...f, enabled: v }))}
                  />
                  <span className="text-sm text-gray-700">
                    {form.enabled ? 'Habilitada' : 'Desabilitada'}
                  </span>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.query.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded font-medium disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
