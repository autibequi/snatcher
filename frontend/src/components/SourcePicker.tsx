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
    return <div className="text-gray-500">Loading sources...</div>
  }

  if (!sources || sources.length === 0) {
    return <div className="text-gray-500">No sources available</div>
  }

  const allSelected = sources.length > 0 && value.length === sources.length
  const someSelected = value.length > 0 && value.length < sources.length

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={handleSelectAll}
          disabled={disabled || allSelected}
          className="px-3 py-1.5 text-sm font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Select All
        </button>
        <button
          onClick={handleClear}
          disabled={disabled || value.length === 0}
          className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
        {someSelected && (
          <span className="text-sm text-gray-600 flex items-center">
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
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
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
