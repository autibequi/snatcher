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
const Composer = lazy(() => import('./pages/Composer'))
const ActivityHub = lazy(() =>
  import('./pages/activity/ActivityHub').then(m => ({ default: m.ActivityHub }))
)

const Crawlers = lazy(() => import('./pages/Crawlers'))
const CrawlerDetail = lazy(() => import('./pages/CrawlerDetail'))

const PublicLinks = lazy(() => import('./pages/PublicLinks'))

const Groups = lazy(() => import('./pages/Groups'))
const GroupDetail = lazy(() => import('./pages/GroupDetail'))
const Affiliates = lazy(() => import('./pages/Affiliates'))

const Analytics = lazy(() => import('./pages/Analytics'))

const Settings = lazy(() => import('./pages/Settings'))
const Taxonomy = lazy(() => import('./pages/Taxonomy'))
const Manual = lazy(() => import('./pages/Manual'))
const ManualTutorialPage = lazy(() => import('./pages/ManualTutorialPage'))

const Setup = lazy(() => import('./pages/Setup'))
const AdminConversions = lazy(() => import('./pages/AdminConversions'))
const AdminParams = lazy(() => import('./pages/AdminParams'))
const AdminCatalogCanonical = lazy(() => import('./pages/AdminCatalogCanonical'))
const AdminSenders = lazy(() => import('./pages/AdminSenders'))
const AdminAudit = lazy(() => import('./pages/AdminAudit'))
const AdminObservability = lazy(() => import('./pages/AdminObservability'))
const BaselineTab = lazy(() => import('./pages/admin/BaselineTab').then(m => ({ default: m.BaselineTab })))
const AdminScrapers = lazy(() => import('./pages/AdminScrapers'))
const AdminTemplates = lazy(() => import('./pages/AdminTemplates'))
const RedirectDomains = lazy(() => import('./pages/RedirectDomains'))
const Channels = lazy(() => import('./pages/Channels'))

// Fase A: Hub Inteligência
const Intelligence = lazy(() => import('./pages/intelligence/Intelligence'))

// W1-W5: Novas telas de schema backend
// CanonicalGroupsView absorvida como aba em AdminCatalogCanonical (rota original → redirect)
// TaxonomyTreeEditor absorvida como aba em Taxonomy (rota original → redirect)
// RateBucketsView absorvida como aba em DispatchRoutingView (rota original → redirect)
const DispatchRoutingView = lazy(() => import('./pages/admin/DispatchRoutingView'))

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
              <Route path="compose" element={<Composer />} />
              <Route path="activity" element={<ActivityHub />} />

              {/* FONTES & PRODUTOS */}
              <Route path="crawlers" element={<Crawlers />} />
              <Route path="crawlers/:id" element={<CrawlerDetail />} />

              {/* DESTINOS */}
              <Route path="links" element={<PublicLinks />} />

              {/* PROVEDORES */}
              <Route path="groups" element={<Groups />} />
              <Route path="groups/:id" element={<GroupDetail />} />
              <Route path="affiliates" element={<Affiliates />} />

              {/* ANÁLISE */}
              <Route path="analytics" element={<Analytics />} />
              <Route path="clusters" element={<Navigate to="/analytics" replace />} />

              {/* SISTEMA */}
              <Route path="settings/*" element={<Settings />} />
              <Route path="taxonomy" element={<Taxonomy />} />
              <Route path="manual" element={<Manual />} />
              <Route path="manual/:slug" element={<ManualTutorialPage />} />

              {/* Fase 2: Conversion tracking */}
              <Route path="admin/conversions" element={<AdminConversions />} />

              {/* Fase 9: Admin Snatcher v2 — Parâmetros tunáveis */}
              <Route path="admin/params" element={<AdminParams />} />


              {/* Fase 3b: Admin Snatcher v2 — Catalog Canônico */}
              <Route path="admin/catalog-canonical" element={<AdminCatalogCanonical />} />
              {/* Fase 4: Admin Snatcher v2 — Modems & Senders */}
              <Route path="admin/senders" element={<AdminSenders />} />

              {/* Fase 10: Admin Snatcher v2 — Audit / Metrics / Scrapers (Alerts removido W4) */}
              <Route path="admin/audit" element={<AdminAudit />} />
              <Route path="admin/metrics" element={<Navigate to="/analytics" replace />} />
              <Route path="admin/observability" element={<AdminObservability />} />
              <Route path="admin/baseline" element={<BaselineTab />} />
              <Route path="admin/scrapers" element={<AdminScrapers />} />
              <Route path="admin/templates" element={<AdminTemplates />} />
              <Route path="admin/domains" element={<RedirectDomains />} />

              {/* Fase A: Hub Inteligência */}
              <Route path="intelligence" element={<Intelligence />} />

              {/* W1-W5: Novas telas de schema backend */}
              {/* admin/canonical-groups absorvida na aba "Grupos Canônicos" de /admin/catalog-canonical */}
              <Route path="admin/canonical-groups" element={<Navigate to="/admin/catalog-canonical?tab=groups" replace />} />
              {/* admin/taxonomy-tree absorvida na aba "Árvore" de /taxonomy */}
              <Route path="admin/taxonomy-tree" element={<Navigate to="/taxonomy?tab=tree" replace />} />
              <Route path="admin/dispatch/routing" element={<DispatchRoutingView />} />
              {/* rate-buckets absorvida como aba em DispatchRoutingView */}
              <Route path="admin/dispatch/rate-buckets" element={<Navigate to="/admin/dispatch/routing?tab=rate-buckets" replace />} />

              {/* admin/health substituído pelo Painel (C2) — redirect para home */}
              <Route path="admin/health" element={<Navigate to="/" replace />} />

              {/* Redirects de URLs antigas */}
              <Route path="logs" element={<Navigate to="/activity" replace />} />
              <Route path="ads" element={<Navigate to="/activity" replace />} />
              <Route path="auto-match" element={<Navigate to="/settings/loops" replace />} />
              <Route path="automations" element={<Navigate to="/settings/loops" replace />} />
              <Route path="automations/*" element={<Navigate to="/settings/loops" replace />} />
              <Route path="match" element={<Navigate to="/settings/params" replace />} />
              {/* Jonfrey config migrado para Settings > Loops LLM */}
              <Route path="settings/jonfrey" element={<Navigate to="/settings/loops" replace />} />
              {/* Migrado para Settings */}
              <Route path="admin/loops" element={<Navigate to="/settings/loops" replace />} />
              {/* admin/params e admin/audit têm rota-página própria acima (linhas 178/187);
                  os redirects daqui eram inalcançáveis (a rota-página casa primeiro) — removidos. */}
              <Route path="channels" element={<Channels />} />
              <Route path="catalog" element={<Navigate to="/admin/catalog-canonical" replace />} />
              <Route path="curation" element={<Navigate to="/admin/catalog-canonical" replace />} />
              <Route path="accounts" element={<Navigate to="/admin/senders" replace />} />

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
