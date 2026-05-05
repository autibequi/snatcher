
/** Tonal override para o delta — por padrão: positivo=success, negativo=danger */
export type DeltaTone = 'success' | 'danger' | 'warning' | 'neutral'

export interface KpiCardDelta {
  /** Valor numérico para determinar sinal (↑/↓) e cor padrão. Pode ser omitido se `displayText` fornecido. */
  value?: number
  /** Texto já formatado a exibir (ex: "↑12% vs semana anterior"). Se presente, sobrepõe formatação automática. */
  displayText?: string
  label?: string
  /** Sobrepõe a cor derivada do `value` */
  tone?: DeltaTone
}

interface KpiCardProps {
  label: string
  value: string | number
  delta?: KpiCardDelta
  /** Subtítulo/nota abaixo do valor (ex: "2.184 únicos", "2 contas em uso normal") */
  subtitle?: string
  className?: string
}

const toneClasses: Record<DeltaTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-fg-3',
}

function resolveTone(delta: KpiCardDelta): DeltaTone {
  if (delta.tone) return delta.tone
  if (delta.value === undefined) return 'neutral'
  return delta.value >= 0 ? 'success' : 'danger'
}

export function KpiCard({ label, value, delta, subtitle, className = '' }: KpiCardProps) {
  let deltaText: string | undefined
  let deltaColorClass = ''

  if (delta !== undefined) {
    const tone = resolveTone(delta)
    deltaColorClass = toneClasses[tone]

    if (delta.displayText) {
      deltaText = delta.displayText
    } else if (delta.value !== undefined) {
      const sign = delta.value >= 0 ? '+' : ''
      deltaText = `${sign}${delta.value.toFixed(1)}%`
      if (delta.label) deltaText += ` ${delta.label}`
    }
  }

  return (
    <div className={`bg-surface border border-border rounded-md p-4 shadow-card ${className}`}>
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-fg mt-1">{value}</p>
      {deltaText !== undefined && (
        <p className={`text-xs mt-1 ${deltaColorClass}`}>{deltaText}</p>
      )}
      {subtitle !== undefined && (
        <p className="text-xs mt-1 text-fg-3">{subtitle}</p>
      )}
    </div>
  )
}
