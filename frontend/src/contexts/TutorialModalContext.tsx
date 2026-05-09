import React, { createContext } from 'react'

export type TutorialModalApi = {
  openTutorial: () => void
}

export const TutorialModalContext = createContext<TutorialModalApi | null>(null)

export function TutorialModalProvider({
  children,
  openTutorial,
}: {
  children: React.ReactNode
  openTutorial: () => void
}) {
  const value = React.useMemo(() => ({ openTutorial }), [openTutorial])
  return <TutorialModalContext.Provider value={value}>{children}</TutorialModalContext.Provider>
}
