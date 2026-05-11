interface ScoreChipProps {
  value: number
  className?: string
  /** Mostra label numérico dentro do chip (default true) */
  showValue?: boolean
}

// Chip numérico de score 0-100 com 3 tiers — spec v4:
//   ≥75 verde · ≥55 âmbar · <55 vermelho
// Pill compacta tabular — usar em listas de match e produtos.
export function ScoreChip({ value, className = '', showValue = true }: ScoreChipProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const tier =
    v >= 75 ? 'hi'  :
    v >= 55 ? 'mid' :
              'lo'

  const tierClass: Record<typeof tier, string> = {
    hi:  'bg-success-soft text-success border border-success/30',
    mid: 'bg-warning-soft text-warning border border-warning/30',
    lo:  'bg-danger-soft  text-danger  border border-danger/30',
  }

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-[11.5px] font-semibold tabular-nums ${tierClass[tier]} ${className}`}
      title={`Score ${v}/100`}
    >
      {showValue ? v : null}
    </span>
  )
}
