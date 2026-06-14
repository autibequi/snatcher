import { cn } from '../../lib/utils'

// Variante 'line' é alias de 'text'; variante 'table' renderiza múltiplas linhas
// como SkeletonTable (prop rows controla quantidade).
interface SkeletonProps {
  className?: string
  rows?: number
  variant?: 'text' | 'line' | 'card' | 'circle' | 'table'
}

export function Skeleton({ className = '', rows = 1, variant = 'text' }: SkeletonProps) {
  const base = 'animate-pulse bg-surface-2 rounded'

  // Variante table: renderiza N linhas de loading para substituir tabelas
  if (variant === 'table') {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex gap-4 items-center">
            <div className={cn(base, 'h-4 w-1/3')} />
            <div className={cn(base, 'h-4 w-1/4')} />
            <div className={cn(base, 'h-4 w-1/5')} />
            <div className={cn(base, 'h-4 flex-1')} />
          </div>
        ))}
      </div>
    )
  }

  const variantMap = {
    text:   'h-4 w-full',
    line:   'h-4 w-full',  // alias de text
    card:   'h-24 w-full rounded-md',
    circle: 'rounded-full w-8 h-8',
  }

  return <div className={cn(base, variantMap[variant as keyof typeof variantMap] ?? variantMap.text, className)} />
}

// Mantém export nomeado para retrocompatibilidade com callers existentes
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return <Skeleton variant="table" rows={rows} />
}
