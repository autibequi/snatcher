import { useEffect, useState } from 'react'
import { authFetch } from '../../lib/authFetch'

// Health descreve o payload retornado por GET /api/admin/health.
interface Health {
  dispatcher: {
    queue_depth: number
    active_workers: number
  }
  circuit_breaker: Record<string, string>
  llm: {
    cost_today_usd_total: number
  }
  catalog: Record<string, number>
}

// circuitBreakerBadge retorna classes CSS para o badge do circuit breaker por estado.
function circuitBreakerBadge(state: string): string {
  if (state === 'closed') {
    return 'bg-green-100 text-green-700 border border-green-300'
  }
  if (state === 'open') {
    return 'bg-red-100 text-red-700 border border-red-300'
  }
  // half_open ou qualquer outro estado intermediário
  return 'bg-yellow-100 text-yellow-700 border border-yellow-300'
}

// SystemHealth exibe um painel com saúde do sistema, com polling automático a cada 10s.
export function SystemHealth() {
  const [data, setData] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // fetchHealth busca o snapshot atual e atualiza o estado.
    const fetchHealth = async () => {
      try {
        const response = await authFetch('/api/admin/health')
        const json = await response.json()
        setData(json)
        setError(null)
      } catch (err) {
        setError(String(err))
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [])

  if (error !== null) {
    return (
      <div className="text-red-600 text-sm p-4 border border-red-300 rounded">
        O eco do servidor não respondeu. Persistirei tentando.
      </div>
    )
  }

  if (data === null) {
    return <div className="text-fg-3 text-sm p-4">Eu, mythos, ainda meço o silêncio.</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Pulso da Máquina</h2>

      {/* Dispatcher */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-fg-2 text-sm uppercase tracking-wide">Dispatcher</h3>
        <div className="flex gap-8 text-sm">
          <div>
            <span className="text-fg-3">Fila pendente</span>
            <p className="text-2xl font-bold">{data.dispatcher.queue_depth}</p>
          </div>
          <div>
            <span className="text-fg-3">Workers ativos</span>
            <p className="text-2xl font-bold">{data.dispatcher.active_workers}</p>
          </div>
        </div>
      </section>

      {/* Circuit Breakers */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-fg-2 text-sm uppercase tracking-wide">Circuit Breakers</h3>
        {Object.keys(data.circuit_breaker).length === 0 ? (
          <p className="text-fg-4 text-sm">Nenhum upstream monitorado.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {Object.entries(data.circuit_breaker).map(([upstream, state]) => (
              <li key={upstream} className="flex items-center gap-3">
                <span className="font-mono text-fg flex-1">{upstream}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${circuitBreakerBadge(state)}`}
                >
                  {state}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* LLM */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-fg-2 text-sm uppercase tracking-wide">LLM</h3>
        <div className="text-sm">
          <span className="text-fg-3">Custo hoje (USD)</span>
          <p className="text-2xl font-bold">${data.llm.cost_today_usd_total.toFixed(4)}</p>
        </div>
      </section>

      {/* Catálogo */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-fg-2 text-sm uppercase tracking-wide">
          Catálogo — distribuição de status
        </h3>
        {Object.keys(data.catalog).length === 0 ? (
          <p className="text-fg-4 text-sm">Sem dados de catálogo.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.catalog).map(([status, count]) => (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-2 border border-border text-fg-2"
                >
                  <span className="font-mono">{status}</span>
                  <span className="font-bold text-fg">{count}</span>
                </span>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {Object.entries(data.catalog).map(([status, count]) => {
                const total = Object.values(data.catalog).reduce((acc, n) => acc + n, 0)
                const pct = total > 0 ? Math.max(1, Math.round((count / total) * 100)) : 0
                return (
                  <div
                    key={status}
                    className="h-1.5 rounded-full bg-accent/60 transition-all"
                    style={{ width: `${pct}%` }}
                    title={`${status}: ${count} (${pct}%)`}
                  />
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
