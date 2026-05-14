import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  const root = (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-border-strong'
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-3 w-3 rounded-full bg-white shadow-lg ring-0',
          'transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  )

  if (label) {
    return (
      <label className={cn('flex items-center gap-2 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed')}>
        {root}
        <span className="text-sm text-fg">{label}</span>
      </label>
    )
  }

  return root
}
