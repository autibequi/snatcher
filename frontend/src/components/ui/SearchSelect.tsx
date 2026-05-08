import React from 'react'

export interface SearchSelectOption {
  value: string
  label: string
}

interface SearchSelectProps {
  options: SearchSelectOption[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Todas',
  className = '',
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const ref = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Fecha ao clicar fora
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Foca input ao abrir
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const selectedLabel = options.find(o => o.value === value)?.label

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-sm border border-border rounded-md px-2.5 py-1 bg-surface text-fg h-8 flex items-center gap-1 hover:border-border-strong focus:outline-none focus:border-accent min-w-[140px] max-w-[200px]"
      >
        <span className="flex-1 text-left truncate">
          {selectedLabel ?? placeholder}
        </span>
        <svg className={`w-3.5 h-3.5 text-fg-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-md shadow-xl w-56">
          {/* Busca */}
          <div className="px-2 py-1.5 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              onKeyDown={e => e.key === 'Escape' && (setOpen(false), setSearch(''))}
              className="w-full text-xs border border-border rounded px-2 py-1 bg-surface-2 text-fg outline-none focus:border-accent"
            />
          </div>

          {/* Lista */}
          <div className="max-h-52 overflow-y-auto">
            {/* Opção "limpar" */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors ${value === '' ? 'text-accent font-semibold' : 'text-fg-2'}`}
            >
              {placeholder}
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-fg-3">Nenhum resultado</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors truncate ${value === o.value ? 'text-accent font-semibold bg-accent/5' : 'text-fg'}`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
