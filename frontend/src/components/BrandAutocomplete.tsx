import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../lib/authFetch'

export interface ProductBrandRow {
  id: number
  slug: string
  display_name: string
}

type Props = {
  /** texto exibido no input */
  inputValue: string
  onInputChange: (v: string) => void
  /** chamado ao escolher item da lista */
  onSelect: (b: ProductBrandRow) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  limit?: number
}

/**
 * Autocomplete de marcas canónicas (GET /api/admin/product-brands).
 */
export function BrandAutocomplete({
  inputValue,
  onInputChange,
  onSelect,
  placeholder = 'Buscar marca…',
  className = '',
  disabled = false,
  limit = 30,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<ProductBrandRow[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOptions = useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: String(limit) })
        if (q.trim()) params.set('q', q.trim())
        const r = await authFetch(`/api/admin/product-brands?${params}`)
        if (!r.ok) {
          setOptions([])
          return
        }
        const d = (await r.json()) as ProductBrandRow[]
        setOptions(Array.isArray(d) ? d : [])
      } catch {
        setOptions([])
      } finally {
        setLoading(false)
      }
    },
    [limit],
  )

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchOptions(inputValue)
    }, 220)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue, open, fetchOptions])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        value={inputValue}
        disabled={disabled}
        onChange={e => {
          onInputChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          void fetchOptions(inputValue)
        }}
        placeholder={placeholder}
        className="w-full min-w-[7rem] text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-48 overflow-auto rounded border border-border bg-surface shadow-lg text-sm">
          {loading && (
            <div className="px-2 py-1.5 text-fg-4 text-xs">Carregando…</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-2 py-1.5 text-fg-4 text-xs">Nenhuma marca.</div>
          )}
          {!loading &&
            options.map(b => (
              <button
                key={b.id}
                type="button"
                className="w-full text-left px-2 py-1.5 hover:bg-surface-2 truncate"
                onClick={() => {
                  onSelect(b)
                  onInputChange(b.display_name)
                  setOpen(false)
                }}
              >
                <span className="font-medium">{b.display_name}</span>
                <span className="text-fg-4 text-xs ml-1">({b.slug})</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
