// Tabelas
export const tableContainer = 'overflow-x-auto rounded-lg border border-border bg-surface'
export const tableHeader = 'px-4 py-2 text-xs font-medium uppercase tracking-wide text-fg-3 bg-surface-2'
export const tableHeaderCell = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-3'
export const tableRow = 'border-b border-border last:border-0 hover:bg-surface-2 transition-colors'
export const tableCell = 'px-4 py-2.5 text-sm text-fg align-middle'
export const tableCellMuted = 'px-4 py-2.5 text-sm text-fg-3 align-middle'

// Redesign v4: tabela densa para listagens — TH 11px uppercase tracking,
// hover row com mistura sutil de surface-2, números tabular-nums.
// Aplicar em <table className={tblDense}> e <th className={thDense}>, <td className={tdDense}>.
// Linha selecionada: rowSelected (fundo accent-soft + inset-border accent à esquerda).
export const tblDense = 'w-full border-collapse text-sm text-fg'
export const thDense = 'px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-fg-3 bg-surface-2 border-b border-border whitespace-nowrap'
export const thDenseRight = `${thDense} text-right`
export const tdDense = 'px-3 py-2 align-middle border-b border-border last:border-0'
export const tdDenseRight = `${tdDense} text-right tabular-nums`
export const tdDenseMono = `${tdDense} font-mono text-xs text-fg-3`
export const trDense = 'transition-colors hover:bg-[color-mix(in_oklch,oklch(var(--surface-2))_50%,transparent)]'
export const rowSelected = 'bg-accent-soft/60 shadow-[inset_2px_0_0_oklch(var(--accent))]'
export const rowDimmed = 'opacity-55'

// Forms
export const formGroup = 'space-y-1.5'
export const formLabel = 'text-sm font-medium text-fg'
export const formHint = 'text-xs text-fg-3'
export const formError = 'text-xs text-danger'
export const switchRow = 'flex items-center justify-between gap-3 py-2'

// Cards / sections
export const sectionCard = 'rounded-lg border border-border bg-surface p-4'
export const sectionCardMuted = 'rounded-lg border border-border bg-surface-2 p-4'
export const sectionHeader = 'flex items-center justify-between mb-3'
export const sectionTitle = 'text-sm font-semibold text-fg'
export const sectionSubtitle = 'text-xs text-fg-3'

// Filtros sticky (Activity hub, listings)
export const filterBar = 'sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-bg/95 backdrop-blur border-b border-border px-4 py-2.5'

// Status zone (chips)
export const statusChip = 'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium'
export const statusChipSuccess = `${statusChip} bg-success-soft text-success`
export const statusChipWarning = `${statusChip} bg-warning-soft text-warning`
export const statusChipDanger = `${statusChip} bg-danger-soft text-danger`
export const statusChipAccent = `${statusChip} bg-accent-soft text-accent`
export const statusChipMuted = `${statusChip} bg-surface-2 text-fg-3`

// ─── Status normalization ────────────────────────────────────────────────────
//
// Antes desta tabela, cada lugar do app pintava status à mão: a pill externa
// tratava "running" como âmbar (warning) enquanto o popup pintava o mesmo
// "running" de roxo (accent). E o backend mistura vocabulário entre fontes —
// jobs usam "completed/cancelled", Jonfrey usa "success/skipped", a fila web
// também recebe "queued" do dispatcher. Resultado: usuário via dois rótulos
// diferentes para o mesmo estado.
//
// Aqui a gente força UMA única família semântica:
//   running   → accent  (em execução, com pulse)
//   pending   → warning (aguardando — fila, queued, agendado)
//   success   → success (verde — completed, ok, success, delivered)
//   failed    → danger  (vermelho — failed, error)
//   cancelled → muted   (cinza — cancelled)
//   skipped   → muted   (cinza — skipped, ignored)
//
// Backend continua emitindo o vocabulário cru; o front apenas TRADUZ na borda
// para evitar a confusão de "verde aqui, amarelo ali" reportada pelo user.

export type StatusTone = 'running' | 'pending' | 'success' | 'failed' | 'cancelled' | 'skipped'

export interface NormalizedStatus {
  tone: StatusTone
  label: string         // rótulo em PT-BR mostrado ao user
  icon: string          // emoji ASCII curto (sem SVG)
  chipClass: string     // pinta a "pill" externa — usar dentro de className
  pulseDot: boolean     // running mostra um pontinho com animate-pulse
  dotColorClass: string // cor do pulse — alinhada com o tone
}

const STATUS_TONE_MAP: Record<string, StatusTone> = {
  running: 'running',
  in_progress: 'running',
  processing: 'running',
  sending: 'running',

  pending: 'pending',
  queued: 'pending',
  scheduled: 'pending',
  pending_approval: 'pending',
  waiting: 'pending',

  success: 'success',
  completed: 'success',
  done: 'success',
  ok: 'success',
  delivered: 'success',

  failed: 'failed',
  error: 'failed',
  errored: 'failed',

  cancelled: 'cancelled',
  canceled: 'cancelled',
  aborted: 'cancelled',

  skipped: 'skipped',
  ignored: 'skipped',
}

const STATUS_TONE_META: Record<StatusTone, { label: string; icon: string; chipClass: string; dotColorClass: string; pulseDot: boolean }> = {
  running:   { label: 'Em execução', icon: '⏳', chipClass: statusChipAccent,  dotColorClass: 'bg-accent',  pulseDot: true  },
  pending:   { label: 'Aguardando',  icon: '•',  chipClass: statusChipWarning, dotColorClass: 'bg-warning', pulseDot: false },
  success:   { label: 'Concluído',   icon: '✓',  chipClass: statusChipSuccess, dotColorClass: 'bg-success', pulseDot: false },
  failed:    { label: 'Falhou',      icon: '⚠',  chipClass: statusChipDanger,  dotColorClass: 'bg-danger',  pulseDot: false },
  cancelled: { label: 'Cancelado',   icon: '✕',  chipClass: statusChipMuted,   dotColorClass: 'bg-fg-3',    pulseDot: false },
  skipped:   { label: 'Ignorado',    icon: '↷',  chipClass: statusChipMuted,   dotColorClass: 'bg-fg-3',    pulseDot: false },
}

export function normalizeStatus(raw: string | null | undefined): NormalizedStatus {
  const key = (raw ?? '').toLowerCase().trim()
  const tone = STATUS_TONE_MAP[key] ?? 'pending'
  const meta = STATUS_TONE_META[tone]
  return {
    tone,
    label: meta.label,
    icon: meta.icon,
    chipClass: meta.chipClass,
    pulseDot: meta.pulseDot,
    dotColorClass: meta.dotColorClass,
  }
}

export function statusTone(raw: string | null | undefined): StatusTone {
  const key = (raw ?? '').toLowerCase().trim()
  return STATUS_TONE_MAP[key] ?? 'pending'
}

// ─── FW-2: Token consolidation — Tokyo Night formal ──────────────────────────
// Nota: sectionCard, tblDense já existem acima com implementação compatível.
// Os tokens abaixo completam o vocabulário de botões, inputs e badges para FW-3+.

// Botões
export const btnPrimary = 'bg-accent hover:bg-accent/90 text-bg px-4 py-2 rounded-md transition-colors font-medium'
export const btnGhost   = 'hover:bg-surface-2 text-fg px-3 py-1.5 rounded-md transition-colors'
export const btnDanger  = 'bg-danger hover:bg-danger/90 text-white px-4 py-2 rounded-md transition-colors'

// Inputs
export const inputBase  = 'bg-bg border border-border rounded px-3 py-2 focus:border-accent outline-none transition-colors'
export const inputError = 'border-danger focus:border-danger'

// Badges semânticos
export const badgeOk    = 'bg-success/15 text-success px-2 py-0.5 rounded text-xs font-medium'
export const badgeWarn  = 'bg-warning/15 text-warning px-2 py-0.5 rounded text-xs font-medium'
export const badgeError = 'bg-danger/15 text-danger px-2 py-0.5 rounded text-xs font-medium'
export const badgeInfo  = 'bg-accent/15 text-accent px-2 py-0.5 rounded text-xs font-medium'

// Skeleton base (para uso inline sem componente)
export const skeletonBase = 'animate-pulse bg-surface-2 rounded'

// Layout helpers
export const pageContainer = 'mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6'
export const responsiveGrid = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
export const responsiveKpiGrid = 'grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3'

// Ações genéricas (close, link)
export const closeButton = 'text-fg-3 hover:text-fg p-1 rounded transition-colors'
export const linkButton = 'text-accent hover:underline text-sm'

// Chips de categoria
export const categoryChip = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-surface-2 text-fg-2'

// Helpers de cor semântica
export const rateColor = (rate?: number | null): string =>
  rate == null ? 'text-fg-3' : rate >= 0.7 ? 'text-success' : rate >= 0.3 ? 'text-warning' : 'text-danger'

export const statusColor = (ok: boolean): string => ok ? 'text-success' : 'text-danger'

export const statusBg = (tone: 'success' | 'warning' | 'danger'): string =>
  tone === 'success' ? 'bg-success/10' : tone === 'warning' ? 'bg-warning/10' : 'bg-danger/10'
