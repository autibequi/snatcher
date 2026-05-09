import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type PageTitleContextValue = {
  /** Substitui o título inferido da rota (ex.: nome do canal no detalhe). */
  override: string | null
  setPageTitle: (title: string | null) => void
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [override, setPageTitle] = useState<string | null>(null)

  const setPageTitleStable = useCallback((title: string | null) => {
    setPageTitle(title)
  }, [])

  const value = useMemo(
    () => ({ override, setPageTitle: setPageTitleStable }),
    [override, setPageTitleStable],
  )

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>
}

export function usePageTitle(): PageTitleContextValue {
  const ctx = useContext(PageTitleContext)
  if (!ctx) {
    throw new Error('usePageTitle must be used within PageTitleProvider')
  }
  return ctx
}

/** Opcional: páginas fora do provider não quebram (ex.: storybook). */
export function usePageTitleOptional(): PageTitleContextValue | null {
  return useContext(PageTitleContext)
}

/**
 * Define o título na Topbar enquanto o componente está montado.
 */
export function useDocumentPageTitle(title: string | null | undefined) {
  const setPageTitle = usePageTitleOptional()?.setPageTitle ?? (() => {})

  useEffect(() => {
    if (!title) {
      setPageTitle(null)
      return
    }
    setPageTitle(title)
    return () => setPageTitle(null)
  }, [title, setPageTitle])
}
