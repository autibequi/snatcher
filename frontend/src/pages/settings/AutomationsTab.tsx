// AutomationsTab — aba de gerenciamento de automações do sistema.
// Consome /api/admin/automations (W5) para listar, habilitar/desabilitar e disparar manualmente.

import { useEffect, useState } from 'react'
import { authFetch } from '../../lib/authFetch'

// Automation representa o formato retornado pelo backend (GET /api/admin/automations).
interface Automation {
  id: string
  kind: 'critical' | 'elective'
  enabled: boolean
  cron_expr?: string
  interval_minutes?: number
  controlled_by_jonfrey: boolean
  last_run_at?: string
  last_status?: string
}

// loadAutomations busca a lista de automações do backend.
async function loadAutomations(): Promise<Automation[]> {
  const response = await authFetch('/api/admin/automations')
  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao carregar automações`)
  }
  return response.json()
}

// toggleAutomation envia PATCH para habilitar ou desabilitar uma automação.
async function toggleAutomation(id: string, enabled: boolean): Promise<void> {
  await authFetch(`/api/admin/automations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

// triggerRunNow envia POST para disparar a automação imediatamente.
async function triggerRunNow(id: string): Promise<void> {
  await authFetch(`/api/admin/automations/${id}/run-now`, { method: 'POST' })
}

// AutomationsTab renderiza a tabela CRUD de automações.
export function AutomationsTab() {
  const [items, setItems] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // refresh recarrega a lista do backend.
  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadAutomations()
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // handleToggle atualiza enabled de uma automação e recarrega a lista.
  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleAutomation(id, enabled)
      await refresh()
    } catch {
      setError('Erro ao atualizar automação')
    }
  }

  // handleRunNow dispara a automação manualmente e recarrega a lista.
  const handleRunNow = async (id: string) => {
    try {
      await triggerRunNow(id)
      await refresh()
    } catch {
      setError('Erro ao disparar automação')
    }
  }

  if (loading) {
    return <div>Carregando...</div>
  }

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={refresh}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div>
      <h2>Automacoes</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Tipo</th>
            <th>Habilitada</th>
            <th>Intervalo (min)</th>
            <th>Jonfrey</th>
            <th>Ultima exec</th>
            <th>Status</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((automation) => (
            <tr key={automation.id}>
              <td>{automation.id}</td>
              <td>{automation.kind}</td>
              <td>
                <input
                  type="checkbox"
                  checked={automation.enabled}
                  onChange={(event) => handleToggle(automation.id, event.target.checked)}
                />
              </td>
              <td>{automation.interval_minutes ?? '—'}</td>
              <td>{automation.controlled_by_jonfrey ? 'sim' : 'nao'}</td>
              <td>{automation.last_run_at?.slice(0, 19) ?? '—'}</td>
              <td>{automation.last_status ?? '—'}</td>
              <td>
                <button onClick={() => handleRunNow(automation.id)}>Run now</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
