
interface KpiCardProps {
  label: string
  value: string | number
  delta?: { value: number; label?: string }
  className?: string
}

export function KpiCard({ label, value, delta, className = '' }: KpiCardProps) {
  return (
    <div className={`bg-surface border border-border rounded-md p-4 shadow-card ${className}`}>
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-fg mt-1">{value}</p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 ${delta.value >= 0 ? 'text-success' : 'text-danger'}`}>
          {delta.value >= 0 ? '+' : ''}{delta.value.toFixed(1)}%
          {delta.label && <span className="text-fg-3"> {delta.label}</span>}
        </p>
      )}
    </div>
  )
}
