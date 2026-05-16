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

// circuitBreakerColor mapeia estados do circuit breaker para classes CSS de cor.
function circuitBreakerColor(state: string): string {
  if (state === 'closed') {
    return 'text-green-600'
  }
  if (state === 'open') {
    return 'text-red-600'
  }
  return 'text-yellow-600'
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
          <ul className="space-y-1 text-sm">
            {Object.entries(data.circuit_breaker).map(([upstream, state]) => (
              <li key={upstream} className="flex items-center gap-2">
                <span className="font-mono text-fg">{upstream}</span>
                <span className={`font-semibold ${circuitBreakerColor(state)}`}>{state}</span>
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
      <section className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-fg-2 text-sm uppercase tracking-wide">
          Catálogo — distribuição de status
        </h3>
        {Object.keys(data.catalog).length === 0 ? (
          <p className="text-fg-4 text-sm">Sem dados de catálogo.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {Object.entries(data.catalog).map(([status, count]) => (
              <li key={status} className="flex items-center gap-2">
                <span className="font-mono text-fg">{status}</span>
                <span className="text-fg-2 font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
