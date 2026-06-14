import { useEnabledSources } from '../hooks/useSources'
import { SourceBadge } from './SourceBadge'

interface SourcePickerProps {
  value: string[]
  onChange: (ids: string[]) => void
  category?: 'ecommerce' | 'cdkey'
  disabled?: boolean
}

export function SourcePicker({ value, onChange, category, disabled = false }: SourcePickerProps) {
  const { data: sources, isLoading } = useEnabledSources(category)

  const handleToggle = (sourceId: string) => {
    const newValue = value.includes(sourceId)
      ? value.filter(id => id !== sourceId)
      : [...value, sourceId]
    onChange(newValue)
  }

  const handleSelectAll = () => {
    if (sources) {
      onChange(sources.map(s => s.id))
    }
  }

  const handleClear = () => {
    onChange([])
  }

  if (isLoading) {
    return <div className="text-fg-3">Loading sources...</div>
  }

  if (!sources || sources.length === 0) {
    return <div className="text-fg-3">No sources available</div>
  }

  const allSelected = sources.length > 0 && value.length === sources.length
  const someSelected = value.length > 0 && value.length < sources.length

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={handleSelectAll}
          disabled={disabled || allSelected}
          className="px-3 py-1.5 text-sm font-medium bg-accent-soft text-accent rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Select All
        </button>
        <button
          onClick={handleClear}
          disabled={disabled || value.length === 0}
          className="px-3 py-1.5 text-sm font-medium bg-surface-2 text-fg-2 rounded hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
        {someSelected && (
          <span className="text-sm text-fg-2 flex items-center">
            {value.length} of {sources.length} selected
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {sources.map(source => (
          <label
            key={source.id}
            className={`flex items-center gap-2 p-2 rounded border-2 cursor-pointer transition-colors ${
              value.includes(source.id)
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface hover:border-border'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              checked={value.includes(source.id)}
              onChange={() => handleToggle(source.id)}
              disabled={disabled}
              className="w-4 h-4"
            />
            <SourceBadge sourceId={source.id} size="sm" />
          </label>
        ))}
      </div>
    </div>
  )
}
