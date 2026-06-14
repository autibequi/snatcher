interface SparklineProps {
  values: number[]
  className?: string
  /** Altura total em px (spec: 22) */
  height?: number
  /** Largura por barra incluindo gap em px (spec: barras finas + gap 2) */
  barWidth?: number
  /** Cor das barras — defaults para accent 75% via class */
  variant?: 'accent' | 'success' | 'fg'
}

// Barras verticais simples — accent 75% opacity, gap 2, altura 22.
// Aceita até 12 pontos; se menos, distribui igual. Se nenhum valor, mostra placeholder magro.
export function Sparkline({
  values,
  className = '',
  height = 22,
  barWidth = 4,
  variant = 'accent',
}: SparklineProps) {
  const points = values && values.length > 0 ? values : [0]
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)

  const colorClass =
    variant === 'success' ? 'bg-success/75' :
    variant === 'fg'      ? 'bg-fg-3/60'    :
                            'bg-accent/75'

  return (
    <div
      className={`inline-flex items-end gap-[2px] ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {points.map((v, i) => {
        const norm = (v - min) / range
        const h = Math.max(2, Math.round(norm * height))
        return (
          <span
            key={i}
            className={`inline-block rounded-xs ${colorClass}`}
            style={{ width: barWidth, height: h }}
          />
        )
      })}
    </div>
  )
}
