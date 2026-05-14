import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { AuthProvider } from './lib/auth'
import App from './App'
import './index.css'

if (import.meta.env.DEV) document.title = 'Beta Snatcher'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <App />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  )
}
