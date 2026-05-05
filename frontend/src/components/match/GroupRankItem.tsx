import React from 'react'

// Contrato do backend (sendo finalizado em paralelo).
// Frontend consome este tipo; se backend retornar ChannelScore (formato antigo),
// o adapter em Match.tsx mapeia para GroupScore antes de chegar aqui.
export interface GroupScore {
  group_id: number
  group_name: string
  channel_id: number
  channel_name: string
  subcategory?: string
  score: number
  reasons: string[]
  missing_reasons?: string[]
  members_count?: number
  channel_ctr?: number
  historical_ctr_here?: number | null
  discount_threshold?: number
}

// Formato legado que o backend ainda pode retornar
export interface ChannelScore {
  channel_id: number
  channel_name: string
  score: number
  reasons: string[]
  platform?: string
  member_count?: number
}

/** Adapter: ChannelScore → GroupScore (graceful fallback) */
export function adaptChannelScore(cs: ChannelScore): GroupScore {
  return {
    group_id: cs.channel_id,
    group_name: cs.channel_name,
    channel_id: cs.channel_id,
    channel_name: cs.channel_name,
    score: cs.score,
    reasons: cs.reasons ?? [],
    missing_reasons: [],
    members_count: cs.member_count,
    channel_ctr: undefined,
    historical_ctr_here: null,
    discount_threshold: undefined,
  }
}

interface GroupRankItemProps {
  group: GroupScore
  selected: boolean
  batchMode: boolean
  onToggle: () => void
  onAction: (action: 'send' | 'review' | 'skip') => void
  onBreakdown: () => void
}

function fmtPct(v: number | undefined | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export function GroupRankItem({
  group,
  selected,
  batchMode,
  onToggle,
  onAction,
  onBreakdown,
}: GroupRankItemProps) {
  const score = group.score
  const isGreen = score >= 70
  const isYellow = score >= 40 && score < 70
  // anything below 40 → red

  const barColor = isGreen ? 'bg-success' : isYellow ? 'bg-warning' : 'bg-danger'
  const scoreColor = isGreen
    ? 'text-success'
    : isYellow
    ? 'text-warning'
    : 'text-danger'

  const ctaLabel = isGreen ? 'enviar' : isYellow ? 'revisar' : 'pular'
  const ctaVariant: string = isGreen
    ? 'bg-success hover:bg-success/80 text-white'
    : isYellow
    ? 'bg-warning hover:bg-warning/80 text-white'
    : 'bg-surface-2 hover:bg-border text-fg-3'
  const ctaAction: 'send' | 'review' | 'skip' = isGreen
    ? 'send'
    : isYellow
    ? 'review'
    : 'skip'

  return (
    <div
      onClick={batchMode ? onToggle : undefined}
      className={`relative flex items-stretch gap-3 p-3 border rounded-md transition-colors cursor-pointer ${
        selected && batchMode
          ? 'border-accent bg-accent/5'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      {/* Barra vertical colorida */}
      <div className={`w-1 rounded-full flex-shrink-0 self-stretch ${barColor}`} />

      {/* Conteúdo principal */}
      <div className="flex-1 min-w-0">
        {/* Linha 1: nome + subcategoria */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-fg">{group.group_name}</span>
          {group.subcategory && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-2 text-fg-3">
              {group.subcategory}
            </span>
          )}
        </div>

        {/* Linha métricas */}
        <p className="text-xs text-fg-3 mt-0.5">
          {group.members_count != null
            ? `${group.members_count.toLocaleString()} membros · `
            : ''}
          CTR canal {fmtPct(group.channel_ctr)}
          {' · '}
          <span className="font-semibold text-fg">
            histórico aqui {fmtPct(group.historical_ctr_here)}
          </span>
        </p>

        {/* Tags positivas */}
        {group.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {group.reasons.map((r, i) => (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 rounded-sm bg-success/10 text-success"
              >
                + {r}
              </span>
            ))}
          </div>
        )}

        {/* Tags negativas */}
        {(group.missing_reasons ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(group.missing_reasons ?? []).map((r, i) => (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 rounded-sm bg-danger/10 text-danger"
              >
                − {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Coluna direita: score + CTA */}
      <div className="flex flex-col items-end justify-between flex-shrink-0 gap-2">
        {/* Score */}
        <div className="text-right">
          <button
            type="button"
            className={`text-2xl font-bold leading-none ${scoreColor} hover:underline`}
            title="Ver breakdown"
            onClick={e => {
              e.stopPropagation()
              onBreakdown()
            }}
          >
            {score}
          </button>
          <div className="h-1 bg-surface-2 rounded-full mt-1 w-16">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onAction(ctaAction)
          }}
          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${ctaVariant}`}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
