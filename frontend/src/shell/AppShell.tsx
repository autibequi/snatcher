import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ApiErrorToast } from '../components/ApiErrorToast'
import { ManualModal } from '../components/ManualModal'
import { TutorialModalProvider } from '../contexts/TutorialModalContext'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [manualOpen, setManualOpen] = React.useState(false)

  const openManual = React.useCallback(() => setManualOpen(true), [])

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Overlay para mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar desktop fixa / mobile drawer */}
      <aside
        className={`
          fixed top-0 bottom-0 left-0 z-30 w-60 flex-shrink-0
          bg-surface border-r border-border
          transform transition-transform duration-200
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} onOpenManual={openManual} />
        <TutorialModalProvider openTutorial={openManual}>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </TutorialModalProvider>
      </div>
      <ApiErrorToast />
      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  )
}
