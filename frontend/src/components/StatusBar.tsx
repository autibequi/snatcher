import { useEffect, useState, useCallback } from 'react'
import { authFetch } from '../lib/authFetch'
import { useWSEvent } from '../lib/useWS'

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
// Implementação: fetch inicial + re-fetch acionado por eventos WS relevantes.
// Fallback: polling de 30s quando WS não está conectado (token null).
export function StatusBar() {
  const [status, setStatus] = useState<Status | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await authFetch('/api/admin/health')
      if (!response.ok) return
      const data = await response.json()
      setStatus(data)
    } catch {
      // Silenciar erros transitórios — barra simplesmente esmaece.
    }
  }, [])

  // Fetch inicial
  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Re-fetch acionado por eventos WS relevantes
  useWSEvent('dispatch.completed',      () => { void fetchStatus() })
  useWSEvent('dispatch.target_updated', () => { void fetchStatus() })
  useWSEvent('crawler.run_completed',   () => { void fetchStatus() })
  useWSEvent('account.status_changed',  () => { void fetchStatus() })

  // Fallback polling (30s) para quando WS não está conectado
  useEffect(() => {
    const id = setInterval(() => { void fetchStatus() }, 30_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  if (!status) return null

  const hasOpenBreaker = Object.values(status.circuit_breaker || {}).some(
    state => state === 'open',
  )

  return (
    <div style={containerStyle}>
      <span>
        queue: {status.dispatcher.queue_depth} · workers: {status.dispatcher.active_workers}
      </span>
      <span>
        {hasOpenBreaker ? (
          <span style={{ color: '#ff6b6b' }}>circuito aberto</span>
        ) : (
          <span style={{ color: '#51cf66' }}>estável</span>
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
