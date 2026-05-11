import React from 'react'

export interface MessagePreviewProps {
  text?: string | null
  mediaUrl?: string | null
  /** inline = compact card for table/dropdown; card = large standalone; wa-bubble = full WhatsApp mock */
  variant?: 'inline' | 'card' | 'wa-bubble'
  /** scroll after this many px (default: no cap) */
  maxHeight?: number
}

/**
 * Reutilizável para todos os previews de mensagem do snatcher.
 * Renderiza foto (se mediaUrl) acima do texto, com altura proporcional ao variant.
 */
export function MessagePreview({
  text,
  mediaUrl,
  variant = 'inline',
  maxHeight,
}: MessagePreviewProps) {
  const hasContent = !!(text?.trim() || mediaUrl)

  if (!hasContent) {
    return (
      <p className="text-xs text-fg-3 italic">Sem conteúdo</p>
    )
  }

  if (variant === 'wa-bubble') {
    return (
      <div className="rounded-2xl bg-[#0b141a] p-2 sm:p-3 shadow-inner ring-1 ring-black/20">
        <p className="text-[11px] text-[#8696a0] mb-1.5 ml-1">Você</p>
        <div
          className="bg-[#005c4b] rounded-xl max-w-[min(100%,280px)] ml-auto shadow-lg overflow-hidden ring-1 ring-white/10"
        >
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt="Mídia"
              className="w-full max-h-44 object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div
            className="p-2.5 sm:p-3 sm:pt-2 overflow-y-auto"
            style={maxHeight ? { maxHeight } : undefined}
          >
            {text ? (
              <p className="text-[12px] sm:text-[13px] leading-snug text-white whitespace-pre-wrap break-words">
                {text}
              </p>
            ) : null}
            <p className="text-[10px] text-emerald-300/90 mt-1.5 text-right tabular-nums">agora ✓✓</p>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className="rounded-lg bg-[#0b141a] p-3 shadow">
        <div className="bg-[#005c4b] rounded-lg max-w-xs ml-auto shadow overflow-hidden">
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt="Mídia"
              className="w-full max-h-[400px] object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div
            className="p-3 overflow-y-auto"
            style={maxHeight ? { maxHeight } : undefined}
          >
            {text ? (
              <p className="text-sm text-white whitespace-pre-wrap break-words">{text}</p>
            ) : null}
            <p className="text-xs text-green-300 mt-1 text-right opacity-60">agora ✓✓</p>
          </div>
        </div>
      </div>
    )
  }

  // inline — compact, for table rows / drawers
  return (
    <div className="rounded-md overflow-hidden border border-border bg-surface-2">
      {mediaUrl && (
        <img
          src={mediaUrl}
          alt="Mídia"
          className="w-full max-h-[200px] object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      {text ? (
        <p
          className="text-sm text-fg whitespace-pre-wrap break-words p-2"
          style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
        >
          {text}
        </p>
      ) : null}
    </div>
  )
}
