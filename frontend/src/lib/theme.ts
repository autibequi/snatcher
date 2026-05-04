import React from 'react'

type Theme = 'light' | 'dark'
type Density = 'compact' | 'comfy'
type Accent = 'indigo' | 'green' | 'orange' | 'pink'

const KEYS = {
  theme: 'snatcher.theme',
  density: 'snatcher.density',
  accent: 'snatcher.accent',
} as const

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(KEYS.theme, theme)
}

function applyDensity(density: Density) {
  document.documentElement.dataset.density = density
  localStorage.setItem(KEYS.density, density)
}

function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent
  localStorage.setItem(KEYS.accent, accent)
}

function getPreferredTheme(): Theme {
  const saved = localStorage.getItem(KEYS.theme) as Theme | null
  if (saved) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function initTheme() {
  applyTheme(getPreferredTheme())
  applyDensity((localStorage.getItem(KEYS.density) as Density | null) ?? 'comfy')
  applyAccent((localStorage.getItem(KEYS.accent) as Accent | null) ?? 'indigo')
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(
    () => (localStorage.getItem(KEYS.theme) as Theme | null) ?? getPreferredTheme()
  )
  const [density, setDensityState] = React.useState<Density>(
    () => (localStorage.getItem(KEYS.density) as Density | null) ?? 'comfy'
  )
  const [accent, setAccentState] = React.useState<Accent>(
    () => (localStorage.getItem(KEYS.accent) as Accent | null) ?? 'indigo'
  )

  const setTheme = React.useCallback((t: Theme) => {
    applyTheme(t)
    setThemeState(t)
  }, [])

  const setDensity = React.useCallback((d: Density) => {
    applyDensity(d)
    setDensityState(d)
  }, [])

  const setAccent = React.useCallback((a: Accent) => {
    applyAccent(a)
    setAccentState(a)
  }, [])

  // Sync between tabs
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEYS.theme && e.newValue) setThemeState(e.newValue as Theme)
      if (e.key === KEYS.density && e.newValue) setDensityState(e.newValue as Density)
      if (e.key === KEYS.accent && e.newValue) setAccentState(e.newValue as Accent)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { theme, setTheme, density, setDensity, accent, setAccent }
}
