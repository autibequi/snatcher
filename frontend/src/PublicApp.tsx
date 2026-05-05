import { Suspense, lazy, Component, ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

// --- Error Boundary ---

interface ErrorBoundaryState {
  error: Error | null
}

interface ErrorBoundaryProps {
  children: ReactNode
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[PublicApp] Error caught:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f87171', fontFamily: 'monospace', background: '#111' }}>
          <h2>Erro inesperado</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Layout ---

function PublicHeader() {
  return (
    <header className="border-b border-border bg-surface px-4 py-3 flex items-center gap-3">
      <span className="text-xl font-bold text-accent">⚡ jon.promo</span>
      <nav className="ml-auto flex gap-4 text-sm text-fg-2">
        <a href="/" className="hover:text-fg transition-colors">Início</a>
        <a href="/canais" className="hover:text-fg transition-colors">Canais</a>
        <a href="https://admin.jon.promo" className="hover:text-fg transition-colors">Admin</a>
      </nav>
    </header>
  )
}

function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface px-4 py-4 text-center text-xs text-fg-3">
      <p>jon.promo &mdash; Promoções 24/7</p>
      <p className="mt-1">
        <a href="https://admin.jon.promo" className="text-accent hover:underline">
          Área administrativa
        </a>
      </p>
    </footer>
  )
}

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-base text-fg">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}

// --- Fallback ---

const Fallback = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  </div>
)

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-2xl font-semibold text-fg">404</p>
      <p className="text-sm text-fg-2">Página não encontrada</p>
      <a href="/" className="text-sm text-accent hover:underline">Voltar ao início</a>
    </div>
  )
}

// --- Páginas (lazy) ---

const Frontpage = lazy(() => import('./pages/public/Frontpage'))
const ChannelList = lazy(() => import('./pages/public/ChannelList'))

// --- App público ---

export function PublicApp() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <PublicLayout>
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route index element={<Frontpage />} />
              <Route path="canais" element={<ChannelList />} />
              <Route path="canais/:slug" element={<ChannelList />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </PublicLayout>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
