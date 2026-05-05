import { useSources } from '../hooks/useSources'

interface SourceBadgeProps {
  sourceId: string
  size?: 'sm' | 'md'
}

// Simple hash function to map sourceId to 0-7
function getSourceColorIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash) % 8
}

const sourceColors = [
  { bg: 'bg-indigo-100', fg: 'text-indigo-900' },
  { bg: 'bg-green-100', fg: 'text-green-900' },
  { bg: 'bg-pink-100', fg: 'text-pink-900' },
  { bg: 'bg-amber-100', fg: 'text-amber-900' },
  { bg: 'bg-blue-100', fg: 'text-blue-900' },
  { bg: 'bg-violet-100', fg: 'text-violet-900' },
  { bg: 'bg-orange-100', fg: 'text-orange-900' },
  { bg: 'bg-indigo-200', fg: 'text-slate-900' },
]

export function SourceBadge({ sourceId, size = 'md' }: SourceBadgeProps) {
  const { data: sources, isLoading } = useSources()

  if (isLoading) {
    return (
      <span className={`inline-flex items-center rounded-full font-medium bg-gray-200 text-gray-700 ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>
        ...
      </span>
    )
  }

  const source = sources?.find(s => s.id === sourceId)

  if (!source) {
    return (
      <span className={`inline-flex items-center rounded-full font-medium bg-red-100 text-red-700 ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>
        ?
      </span>
    )
  }

  const colorIndex = getSourceColorIndex(sourceId)
  const colors = sourceColors[colorIndex]

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colors.bg} ${colors.fg} ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>
      {source.name}
    </span>
  )
}
