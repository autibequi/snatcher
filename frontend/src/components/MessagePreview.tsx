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
    // Spec v4: canvas verde-pálido oklch(0.92 0.02 130), bubble branco max 280px, texto escuro,
    // meta direita "10:42 ✓✓" cinza, imagem aspect-ratio 1.
    return (
      <div
        className="rounded-2xl p-3 shadow-inner ring-1 ring-black/5"
        style={{ background: 'oklch(0.92 0.02 130)' }}
      >
        <div
          className="rounded-xl max-w-[min(100%,280px)] ml-auto overflow-hidden shadow-md ring-1 ring-black/5"
          style={{ background: 'oklch(0.99 0.005 120)' }}
        >
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt="Mídia"
              className="w-full aspect-square object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div
            className="px-3 py-2 overflow-y-auto"
            style={maxHeight ? { maxHeight } : undefined}
          >
            {text ? (
              <p
                className="text-[13px] leading-snug whitespace-pre-wrap break-words"
                style={{ color: 'oklch(0.22 0.012 270)' }}
              >
                {text}
              </p>
            ) : null}
            <p
              className="text-[11px] mt-1 text-right tabular-nums"
              style={{ color: 'oklch(0.55 0.012 270)' }}
            >
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
            </p>
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
