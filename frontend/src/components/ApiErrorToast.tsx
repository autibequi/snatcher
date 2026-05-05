import React from 'react'

interface ApiErrorDetail {
  status?: number
  method: string
  url: string
  message: string
}

interface ToastEntry extends ApiErrorDetail {
  id: number
}

let nextId = 1

export function ApiErrorToast() {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([])

  React.useEffect(() => {
    function onError(e: Event) {
      const detail = (e as CustomEvent<ApiErrorDetail>).detail
      const id = nextId++
      const entry: ToastEntry = { ...detail, id }
      setToasts(prev => [...prev, entry])
      // auto-dismiss em 6s (404/400 ficam pouco), erros 5xx em 10s
      const ttl = (detail.status ?? 0) >= 500 ? 10_000 : 6_000
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, ttl)
    }
    window.addEventListener('api:error', onError)
    return () => window.removeEventListener('api:error', onError)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md">
      {toasts.map(t => {
        const colorClass =
          (t.status ?? 0) >= 500 ? 'bg-red-600' :
          (t.status ?? 0) === 404 ? 'bg-amber-600' :
          (t.status ?? 0) >= 400 ? 'bg-orange-600' :
          'bg-red-600'
        return (
          <div
            key={t.id}
            className={`${colorClass} text-white rounded-md shadow-modal px-4 py-3 text-sm flex items-start gap-3`}
            role="alert"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs bg-black/20 px-1.5 py-0.5 rounded">
                  {t.status ?? 'NET'} {t.method}
                </span>
                <span className="truncate text-xs opacity-90">{t.url}</span>
              </div>
              <p className="break-words">{t.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-white/80 hover:text-white text-lg leading-none"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
