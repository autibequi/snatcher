import { useTheme } from '../../lib/theme'

const ICONS: Record<string, string> = {
  system: '🖥️',
  light: '☀️',
  dark: '🌙',
}

const NEXT: Record<string, 'system' | 'light' | 'dark'> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const LABELS: Record<string, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = NEXT[theme] ?? 'system'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2 transition-colors"
      title={`Tema atual: ${LABELS[theme] ?? 'Sistema'} — clique para alternar (próximo: ${LABELS[next]})`}
      aria-label={`Tema ${LABELS[theme] ?? 'Sistema'}`}
    >
      {ICONS[theme] ?? '🖥️'}
    </button>
  )
}
