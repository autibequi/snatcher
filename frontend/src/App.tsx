import { Suspense, lazy, Component, ErrorInfo, ReactNode, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from './shell'
import { RequireAuth } from './components/RequireAuth'
import { GtmLoader } from './components/GtmLoader'
import { apiClient } from './lib/apiClient'

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
    console.error('Error caught:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f87171', fontFamily: 'monospace', background: '#111' }}>
          <h2>React Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888', marginTop: 10 }}>{this.state.error.stack}</pre>
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

// --- Placeholders ---

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
      <p className="text-2xl font-semibold text-fg">404</p>
      <p className="text-sm text-fg-2">Página não encontrada</p>
      <a href="/" className="text-sm text-accent hover:underline">Voltar ao início</a>
    </div>
  )
}

const Fallback = () => (
  <div className="flex items-center justify-center h-full min-h-64">
    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  </div>
)

// --- Páginas existentes (lazy) ---

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Match = lazy(() => import('./pages/Match'))
const Composer = lazy(() => import('./pages/Composer'))
const Activity = lazy(() => import('./pages/Activity'))

const Crawlers = lazy(() => import('./pages/Crawlers'))
const CrawlerDetail = lazy(() => import('./pages/CrawlerDetail'))
const Catalog = lazy(() => import('./pages/Catalog'))
const Curation = lazy(() => import('./pages/Curation'))

const Channels = lazy(() => import('./pages/Channels'))
const ChannelDetail = lazy(() => import('./pages/ChannelDetail'))
const PublicLinks = lazy(() => import('./pages/PublicLinks'))

const Groups = lazy(() => import('./pages/Groups'))
const GroupDetail = lazy(() => import('./pages/GroupDetail'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Affiliates = lazy(() => import('./pages/Affiliates'))

const Analytics = lazy(() => import('./pages/Analytics'))
const Clusters = lazy(() => import('./pages/Clusters'))

const Settings = lazy(() => import('./pages/Settings'))
const Taxonomy = lazy(() => import('./pages/Taxonomy'))
const Manual = lazy(() => import('./pages/Manual'))
const ManualTutorialPage = lazy(() => import('./pages/ManualTutorialPage'))

const Setup = lazy(() => import('./pages/Setup'))
const DevAtoms = import.meta.env.DEV
  ? lazy(() => import('./pages/DevAtoms'))
  : null

// Redireciona para /setup se nenhum usuário existir ainda
function SetupGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  useEffect(() => {
    apiClient.get('/api/setup/status').then(r => {
      if (r.data?.needs_setup) navigate('/setup', { replace: true })
    }).catch(() => {})
  }, [navigate])
  return <>{children}</>
}

// --- App ---

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GtmLoader />
        <Suspense fallback={<Fallback />}>
          <SetupGuard>
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              {/* OPERAÇÃO */}
              <Route index element={<Dashboard />} />
              <Route path="match" element={<Match />} />
              <Route path="compose" element={<Composer />} />
              <Route path="activity" element={<Activity />} />

              {/* FONTES & PRODUTOS */}
              <Route path="crawlers" element={<Crawlers />} />
              <Route path="crawlers/:id" element={<CrawlerDetail />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="curation" element={<Curation />} />

              {/* DESTINOS */}
              <Route path="channels" element={<Channels />} />
              <Route path="channels/:id" element={<ChannelDetail />} />
              <Route path="links" element={<PublicLinks />} />

              {/* PROVEDORES */}
              <Route path="groups" element={<Groups />} />
              <Route path="groups/:id" element={<GroupDetail />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="affiliates" element={<Affiliates />} />

              {/* ANÁLISE */}
              <Route path="analytics" element={<Analytics />} />
              <Route path="clusters" element={<Clusters />} />

              {/* SISTEMA */}
              <Route path="settings/*" element={<Settings />} />
              <Route path="taxonomy" element={<Taxonomy />} />
              <Route path="manual" element={<Manual />} />
              <Route path="manual/:slug" element={<ManualTutorialPage />} />

              {/* Redirects de URLs antigas */}
              <Route path="logs" element={<Navigate to="/activity" replace />} />
              <Route path="ads" element={<Navigate to="/activity" replace />} />
              <Route path="auto-match" element={<Navigate to="/channels" replace />} />
              <Route path="automations" element={<Navigate to="/channels" replace />} />
              <Route path="automations/channels" element={<Navigate to="/channels" replace />} />
              <Route path="automations/jonfrey" element={<Navigate to="/activity?tab=jonfrey" replace />} />
              <Route path="automations/pending" element={<Navigate to="/activity?tab=pending" replace />} />

              {import.meta.env.DEV && DevAtoms && <Route path="_dev/atoms" element={<DevAtoms />} />}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </SetupGuard>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
