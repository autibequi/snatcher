/**
 * Classes Tailwind partilhadas — superfícies, rótulos e foco.
 * Tema: OKLCH em index.css (bg, surface, accent, danger, …).
 */

/** Painel elevado: cartões, KPIs, blocos de formulário em página */
export const uiPanel =
  'rounded-lg border border-border bg-surface shadow-card'

/** Painel secundário / aninhado (menos contraste) */
export const uiPanelMuted =
  'rounded-lg border border-border/80 bg-surface-2/50 shadow-sm'

/** Rótulos de secção (KPI, colunas de tabela, grupo do menu) */
export const uiSectionLabel =
  'text-xs font-medium text-fg-3 uppercase tracking-wide'

/** Contorno de foco acessível — botões e tabs custom */
export const uiFocusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
