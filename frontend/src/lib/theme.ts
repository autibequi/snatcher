import React from 'react'

// 'system' = segue prefers-color-scheme; 'light'/'dark' = explícito
type ThemePref = 'system' | 'light' | 'dark'
type Theme = 'light' | 'dark'
type Density = 'compact' | 'comfy'
type Accent = 'indigo' | 'green' | 'orange' | 'pink'

const KEYS = {
  theme: 'snatcher.theme',
  density: 'snatcher.density',
  accent: 'snatcher.accent',
} as const

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref
}

function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref)
  localStorage.setItem(KEYS.theme, pref)
}

function applyDensity(density: Density) {
  document.documentElement.dataset.density = density
  localStorage.setItem(KEYS.density, density)
}

function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent
  localStorage.setItem(KEYS.accent, accent)
}

function getSavedPref(): ThemePref {
  const saved = localStorage.getItem(KEYS.theme) as ThemePref | null
  if (saved === 'system' || saved === 'light' || saved === 'dark') return saved
  // default = system
  return 'system'
}

export function initTheme() {
  applyTheme(getSavedPref())
  applyDensity((localStorage.getItem(KEYS.density) as Density | null) ?? 'comfy')
  applyAccent((localStorage.getItem(KEYS.accent) as Accent | null) ?? 'indigo')

  // Reaplica quando o tema do sistema muda (se prefer = 'system')
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', () => {
    const pref = getSavedPref()
    if (pref === 'system') {
      document.documentElement.dataset.theme = resolveTheme(pref)
    }
  })
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<ThemePref>(() => getSavedPref())
  const [density, setDensityState] = React.useState<Density>(
    () => (localStorage.getItem(KEYS.density) as Density | null) ?? 'comfy'
  )
  const [accent, setAccentState] = React.useState<Accent>(
    () => (localStorage.getItem(KEYS.accent) as Accent | null) ?? 'indigo'
  )

  const setTheme = React.useCallback((t: ThemePref) => {
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

  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEYS.theme && e.newValue) setThemeState(e.newValue as ThemePref)
      if (e.key === KEYS.density && e.newValue) setDensityState(e.newValue as Density)
      if (e.key === KEYS.accent && e.newValue) setAccentState(e.newValue as Accent)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { theme, setTheme, density, setDensity, accent, setAccent, resolvedTheme: resolveTheme(theme) }
}
