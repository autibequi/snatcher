import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { connectWS, WSEvent } from './ws'

const WSContext = React.createContext<{ subscribe: (handler: (e: WSEvent) => void) => () => void } | null>(null)

interface WSProviderProps {
  token: string | null
  children: React.ReactNode
}

export function WSProvider({ token, children }: WSProviderProps) {
  const queryClient = useQueryClient()
  const handlers = React.useRef<Set<(e: WSEvent) => void>>(new Set())

  React.useEffect(() => {
    if (!token) return

    const conn = connectWS(token, (event) => {
      // Invalidar queries relevantes por tipo de evento
      switch (event.type) {
        case 'account.status_changed':
          void queryClient.invalidateQueries({ queryKey: ['accounts'] })
          break
        case 'crawler.run_completed':
          void queryClient.invalidateQueries({ queryKey: ['crawlers', event.data.crawlerId, 'runs'] })
          void queryClient.invalidateQueries({ queryKey: ['catalog'] })
          break
        case 'dispatch.target_updated':
        case 'dispatch.completed':
          void queryClient.invalidateQueries({ queryKey: ['dispatches', event.data.dispatchId] })
          break
        case 'product.new':
          void queryClient.invalidateQueries({ queryKey: ['dashboard', 'feed'] })
          break
      }
      // Fan-out para handlers registrados
      handlers.current.forEach(h => h(event))
    })

    return () => conn.close()
  }, [token, queryClient])

  const subscribe = React.useCallback((handler: (e: WSEvent) => void) => {
    handlers.current.add(handler)
    return () => handlers.current.delete(handler)
  }, [])

  return <WSContext.Provider value={{ subscribe }}>{children}</WSContext.Provider>
}

export function useWSEvent<T extends WSEvent['type']>(
  type: T,
  handler: (data: Extract<WSEvent, { type: T }>['data']) => void
) {
  const ctx = React.useContext(WSContext)
  const handlerRef = React.useRef(handler)
  handlerRef.current = handler

  React.useEffect(() => {
    if (!ctx) return
    return ctx.subscribe((event) => {
      if (event.type === type) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handlerRef.current((event as any).data)
      }
    })
  }, [ctx, type])
}
