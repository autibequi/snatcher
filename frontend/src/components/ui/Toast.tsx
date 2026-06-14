import React from 'react'
import { cn } from '../../lib/utils'

// ─── Toast system — Tokyo Night themed ───────────────────────────────────────
// Não usa library externa (nenhuma encontrada no package.json).
// Usa o mesmo mecanismo de custom events do ApiErrorToast para consistência.
// Disparar via: window.dispatchEvent(new CustomEvent('toast', { detail: { ... } }))
// Ou usar o helper toast() exportado.

export type ToastVariant = 'ok' | 'warn' | 'error' | 'info'

export interface ToastDetail {
  message: string
  variant?: ToastVariant
  // duração em ms; default 5000 (ok/info) ou 8000 (error/warn)
  duration?: number
}

interface ToastEntry extends ToastDetail {
  id: number
}

let nextId = 1

// ─── Estilos por variante (Tokyo Night) ──────────────────────────────────────
const variantStyles: Record<ToastVariant, string> = {
  ok:    'bg-success text-white',
  info:  'bg-accent text-white',
  warn:  'bg-warning text-white',
  error: 'bg-danger text-white',
}

const variantIcons: Record<ToastVariant, string> = {
  ok:    '✓',
  info:  'i',
  warn:  '!',
  error: '✕',
}

// ─── Componente provider — montar em AppShell (junto ao ApiErrorToast) ────────
export function ToastContainer() {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([])

  React.useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ToastDetail>).detail
      const id = nextId++
      const variant = detail.variant ?? 'info'
      const duration = detail.duration ?? (variant === 'error' || variant === 'warn' ? 8_000 : 5_000)

      setToasts(prev => [...prev, { ...detail, id, variant }])

      // Auto-dismiss após duration
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }

    window.addEventListener('toast', onToast)
    return () => window.removeEventListener('toast', onToast)
  }, [])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md" role="log" aria-live="polite">
      {toasts.map(t => {
        const variant = t.variant ?? 'info'
        return (
          <div
            key={t.id}
            className={cn(variantStyles[variant], 'rounded-md shadow-modal px-4 py-3 text-sm flex items-start gap-3')}
            role="alert"
          >
            {/* Ícone de variante */}
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
              {variantIcons[variant]}
            </span>
            <p className="flex-1 break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-white/80 hover:text-white text-lg leading-none flex-shrink-0"
              aria-label="Fechar notificação"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helper imperativo — disparar toast sem contexto React ────────────────────
export function toast(message: string, variant: ToastVariant = 'info', duration?: number) {
  window.dispatchEvent(
    new CustomEvent<ToastDetail>('toast', { detail: { message, variant, duration } })
  )
}
