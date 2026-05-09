import React from 'react'

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Conteúdo à direita (botões, filtros) em viewport largo */
  actions?: React.ReactNode
  /** Título principal: `lg` = text-xl (listas/dashboard), `md` = text-lg (detalhe) */
  size?: 'lg' | 'md'
  /** `id` no parágrafo do subtítulo (ex.: leitores de tela / testes) */
  subtitleId?: string
  className?: string
}

/**
 * Cabeçalho de página com título, subtítulo opcional e faixa de ações.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  size = 'lg',
  subtitleId,
  className = '',
}: PageHeaderProps) {
  const titleClass = size === 'lg' ? 'text-xl font-semibold text-fg' : 'text-lg font-semibold text-fg'

  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`.trim()}
    >
      <div>
        <h1 className={titleClass}>{title}</h1>
        {subtitle != null ? (
          <p id={subtitleId} className="text-sm text-fg-3 mt-0.5">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 flex-shrink-0 items-center">{actions}</div> : null}
    </div>
  )
}
