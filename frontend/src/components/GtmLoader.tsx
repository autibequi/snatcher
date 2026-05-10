import React from 'react'
import { useLocation } from 'react-router-dom'
import { apiClient } from '../lib/apiClient'
import { injectGoogleTagManager, pushVirtualPageView } from '../lib/gtm'

/**
 * Carrega GTM a partir de GET /api/brand (gtm_container_id) e envia page_view em mudanças de rota SPA.
 */
export function GtmLoader() {
  const location = useLocation()
  const [gtmReady, setGtmReady] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    apiClient
      .get<{ gtm_container_id?: string }>('/api/brand')
      .then(r => {
        const id = r.data?.gtm_container_id?.trim()
        if (cancelled || !id) return
        injectGoogleTagManager(id)
        setGtmReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!gtmReady) return
    pushVirtualPageView(
      location.pathname + location.search,
      typeof document !== 'undefined' ? document.title : '',
    )
  }, [location.pathname, location.search, gtmReady])

  return null
}
