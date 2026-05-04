
interface ScoreBarProps {
  value: number  // 0-100
  showLabel?: boolean
  className?: string
}

export function ScoreBar({ value, showLabel = true, className = '' }: ScoreBarProps) {
  const clamp = Math.max(0, Math.min(100, value))
  const color = clamp >= 70 ? 'bg-success' : clamp >= 40 ? 'bg-warning' : 'bg-danger'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamp}%` }} />
      </div>
      {showLabel && <span className="text-xs text-fg-2 w-7 text-right">{clamp}</span>}
    </div>
  )
}
