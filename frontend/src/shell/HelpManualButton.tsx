import { useEffect, useState, useRef, useCallback } from 'react'

/** Persistido após "Entendi", abrir manual ou clicar no botão de ajuda. */
export const MANUAL_HELP_HINT_STORAGE_KEY = 'snatcher.manual.helpHintDismissed'

export function HelpManualButton({ onOpenManual }: { onOpenManual: () => void }) {
  const [showHint, setShowHint] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(MANUAL_HELP_HINT_STORAGE_KEY) !== '1') {
        setShowHint(true)
      }
    } catch {
      /* private mode etc. */
    }
  }, [])

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(MANUAL_HELP_HINT_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowHint(false)
  }, [])

  const openManual = () => {
    dismiss()
    onOpenManual()
  }

  useEffect(() => {
    if (!showHint) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) dismiss()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showHint, dismiss])

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      {showHint && (
        <div
          role="dialog"
          aria-labelledby="help-hint-title"
          className="absolute bottom-full right-0 mb-2 z-[100] w-[min(100vw-2rem,18rem)] rounded-lg border border-border bg-surface shadow-modal p-3"
        >
          <p id="help-hint-title" className="text-xs text-fg leading-snug">
            Este ícone é o <strong>ajuda</strong>: abre o <strong>manual operacional</strong> com o passo a passo para usar o
            painel no dia a dia (contas, disparos, automações).
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md border border-border text-fg-2 hover:bg-surface-2"
              onClick={dismiss}
            >
              Entendi
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md bg-accent text-white hover:opacity-90"
              onClick={openManual}
            >
              Abrir manual
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={openManual}
        className="w-8 h-8 rounded-full border border-border bg-surface-2 text-fg-2 hover:text-accent hover:border-accent/50 flex items-center justify-center transition-colors flex-shrink-0"
        aria-label="Abrir manual operacional"
        title="Manual operacional"
      >
        <span className="text-base leading-none" aria-hidden>
          ❓
        </span>
      </button>
    </div>
  )
}
