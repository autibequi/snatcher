export type AccountStatus = 'connected' | 'qr_pending' | 'disconnected' | 'banned'
export type TargetStatus = 'pending' | 'sending' | 'delivered' | 'failed'

export interface DispatchSummary {
  totalTargets: number
  delivered: number
  failed: number
}

export interface Product {
  id: number
  title: string
  marketplace: string
  priceCurrent: number
  drop: number
}

export type WSEvent =
  | { type: 'account.status_changed'; data: { accountId: number; status: AccountStatus; qrCode?: string } }
  | { type: 'crawler.run_completed'; data: { crawlerId: number; found: number; new: number } }
  | { type: 'dispatch.target_updated'; data: { dispatchId: number; groupId: number; status: TargetStatus; errorReason?: string } }
  | { type: 'dispatch.completed'; data: { dispatchId: number; summary: DispatchSummary } }
  | { type: 'product.new'; data: { product: Product } }

type EventHandler = (event: WSEvent) => void

interface WSConnection {
  close: () => void
}

const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000]

export function connectWS(token: string, onEvent: EventHandler): WSConnection {
  let ws: WebSocket | null = null
  let closed = false
  let attempt = 0
  let pingInterval: ReturnType<typeof setInterval> | null = null

  function connect() {
    if (closed) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
    ws = new WebSocket(url)

    ws.onopen = () => {
      attempt = 0
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 25_000)
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WSEvent
        if ((event as { type: string }).type !== 'pong') {
          onEvent(event)
        }
      } catch { /* ignorar mensagens malformadas */ }
    }

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval)
      if (!closed) {
        const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
        attempt++
        setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  return {
    close: () => {
      closed = true
      if (pingInterval) clearInterval(pingInterval)
      ws?.close()
    },
  }
}
