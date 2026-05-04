
interface SkeletonProps {
  className?: string
  variant?: 'text' | 'card' | 'circle'
}

export function Skeleton({ className = '', variant = 'text' }: SkeletonProps) {
  const base = 'animate-pulse bg-surface-2 rounded'
  const variants = {
    text: 'h-4 w-full',
    card: 'h-24 w-full rounded-md',
    circle: 'rounded-full w-8 h-8',
  }
  return <div className={`${base} ${variants[variant]} ${className}`} />
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}
