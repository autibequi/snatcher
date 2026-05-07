type Platform = 'whatsapp' | 'telegram' | 'wa' | 'tg' | string | null | undefined

interface PlatformPillProps {
  platform: Platform
  size?: 'xs' | 'sm'
  className?: string
}

interface Spec {
  label: string
  className: string
}

function specFor(p: Platform): Spec {
  const v = (p ?? '').toString().toLowerCase()
  if (v === 'whatsapp' || v === 'wa') {
    return {
      label: 'WA',
      className:
        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 ring-1 ring-green-300/60 dark:ring-green-700/60',
    }
  }
  if (v === 'telegram' || v === 'tg') {
    return {
      label: 'TG',
      className:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 ring-1 ring-blue-300/60 dark:ring-blue-700/60',
    }
  }
  return {
    label: (p ?? '?').toString().slice(0, 3).toUpperCase(),
    className: 'bg-surface-2 text-fg-2 ring-1 ring-border',
  }
}

const sizeClasses: Record<NonNullable<PlatformPillProps['size']>, string> = {
  xs: 'px-1.5 py-0 text-[10px] tracking-wide',
  sm: 'px-2 py-0.5 text-xs',
}

export function PlatformPill({ platform, size = 'sm', className = '' }: PlatformPillProps) {
  const s = specFor(platform)
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold leading-tight ${s.className} ${sizeClasses[size]} ${className}`}
      title={(platform ?? '').toString()}
    >
      {s.label}
    </span>
  )
}
