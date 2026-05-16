import { useEffect, useState } from 'react'
import { authFetch } from '../lib/authFetch'

// Status agrega os indicadores leves que o user precisa enxergar a todo
// momento — fila pendente, workers ativos e estado dos circuit breakers.
// É um subset de HealthResponse (server endpoint /api/admin/health).
interface Status {
  dispatcher: {
    queue_depth: number
    active_workers: number
  }
  circuit_breaker: Record<string, string>
}

// StatusBar é a barra fixa no rodapé da aplicação. Mostra o pulso do sistema:
// quantos itens aguardam envio, quantos workers estão entregando agora e se
// algum upstream entrou em circuit-breaker open.
//
// Implementação atual: polling HTTP de /api/admin/health a cada 5s.
// Upgrade futuro: usar WebSocket (lib/useWS.tsx existe) quando o backend
// publicar eventos de saúde por canal.
export function StatusBar() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await authFetch('/api/admin/health')
        if (!response.ok) return
        const data = await response.json()
        setStatus(data)
      } catch {
        // Silenciar erros transitórios — barra simplesmente esmaece.
      }
    }

    fetchStatus()
    const intervalId = setInterval(fetchStatus, 5000)
    return () => clearInterval(intervalId)
  }, [])

  if (!status) return null

  const hasOpenBreaker = Object.values(status.circuit_breaker || {}).some(
    state => state === 'open',
  )

  return (
    <div style={containerStyle}>
      <span>
        📦 silêncio · 👷 {status.dispatcher.active_workers}
      </span>
      <span>
        {hasOpenBreaker ? (
          <span style={{ color: '#ff6b6b' }}>🔴 a corrente quebrou em algum lugar</span>
        ) : (
          <span style={{ color: '#51cf66' }}>🟢 estável</span>
        )}
      </span>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: '#1a1a1a',
  color: '#dddddd',
  padding: '4px 12px',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  display: 'flex',
  justifyContent: 'space-between',
  zIndex: 1000,
  borderTop: '1px solid #2a2a2a',
}
