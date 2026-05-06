import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'

interface TaxonomyEntry {
  id: number
  type: 'category' | 'brand'
  name: string
  slug: string
}

interface TagInputProps {
  type: 'category' | 'brand'
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

// TagInput com autocomplete sobre /api/taxonomy.
// Pressione Enter ou vírgula para adicionar; Backspace remove o último.
export default function TagInput({ type, value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: options = [] } = useQuery<TaxonomyEntry[]>({
    queryKey: ['taxonomy', type],
    queryFn: () =>
      apiClient.get(`/api/taxonomy?type=${type}`).then(r => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 5 * 60_000,
  })

  // Filtrar sugestões por draft, excluindo as já adicionadas
  const lower = draft.toLowerCase().trim()
  const suggestions = lower
    ? options
        .filter(
          o =>
            !value.some(v => v.toLowerCase() === o.name.toLowerCase()) &&
            o.name.toLowerCase().includes(lower)
        )
        .slice(0, 8)
    : []

  useEffect(() => {
    setActiveIdx(0)
  }, [draft])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (!t) return
    if (value.some(v => v.toLowerCase() === t.toLowerCase())) return
    onChange([...value, t])
    setDraft('')
  }

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (open && suggestions[activeIdx]) {
        addTag(suggestions[activeIdx].name)
      } else {
        addTag(draft)
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeTag(value.length - 1)
    } else if (e.key === 'ArrowDown' && open && suggestions.length > 0) {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && open && suggestions.length > 0) {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[2.25rem] w-full text-sm border border-border rounded-md px-2 py-1 bg-surface focus-within:border-accent cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-xs font-medium border border-accent/20"
          >
            {tag}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                removeTag(i)
              }}
              className="text-accent/70 hover:text-accent leading-none"
              aria-label={`remover ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="flex-1 min-w-[80px] outline-none bg-transparent text-fg placeholder:text-fg-3 py-0.5"
          placeholder={value.length === 0 ? placeholder : ''}
          value={draft}
          onChange={e => {
            setDraft(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-surface border border-border rounded-md shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                i === activeIdx ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-surface-2'
              }`}
              onClick={() => addTag(s.name)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
