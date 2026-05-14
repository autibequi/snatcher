/**
 * Tokens de cor para Recharts — mapeiam para as CSS variables do design system.
 * Usar em stroke, fill, e dot dos charts para garantir dark mode automático.
 */

// Paleta principal de séries (para charts com múltiplas séries)
export const CHART_COLORS = [
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--danger)',
  'var(--fg-3)',
]

// Cor única por intenção semântica
export const CHART_COLOR = {
  primary:  'var(--accent)',
  success:  'var(--success)',
  danger:   'var(--danger)',
  warning:  'var(--warning)',
  muted:    'var(--fg-3)',
  surface:  'var(--surface-2)',
} as const

// Estilo padrão do grid (cartesian grid)
export const CHART_GRID_STYLE = {
  stroke: 'var(--border)',
  strokeDasharray: '3 3',
}

// Estilo padrão do eixo
export const CHART_AXIS_STYLE = {
  tick: { fill: 'var(--fg-3)', fontSize: 11 },
  axisLine: { stroke: 'var(--border)' },
  tickLine: { stroke: 'var(--border)' },
}

// Estilo padrão do tooltip
export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--fg)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--fg-2)' },
}

// Estilo do dot (LineChart)
export const CHART_DOT_STYLE = {
  r: 3,
  fill: 'var(--surface)',
  strokeWidth: 2,
}
