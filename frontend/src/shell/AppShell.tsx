import React, { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ApiErrorToast } from '../components/ApiErrorToast'
import { ToastContainer } from '../components/ui'
import { ManualModal } from '../components/ManualModal'
import { PageTitleProvider } from '../contexts/PageTitleContext'
// nota: SystemHealth.tsx é renderizado via rota /admin/observability (AdminObservability),
// não no shell. Mantido como rota dedicada pra evitar polling duplicado.

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [manualOpen, setManualOpen] = React.useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Overlay para mobile — fecha ao clicar fora da sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar desktop fixa / mobile drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 flex-shrink-0
          bg-surface border-r border-border
          transition-transform duration-200
          lg:translate-x-0 lg:relative lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <PageTitleProvider>
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            {/* Suspense interno: ao navegar entre rotas lazy, só a área de conteúdo
                troca — o shell (sidebar/topbar) permanece montado, sem flicker. */}
            <Suspense fallback={<ContentFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </PageTitleProvider>
      </div>
      <ApiErrorToast />
      <ToastContainer />
      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  )
}

// ContentFallback — placeholder leve enquanto o chunk da rota carrega. Fica só na
// área de conteúdo (o shell persiste), evitando o flicker de página inteira.
function ContentFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-64" aria-busy>
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
