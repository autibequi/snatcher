/**
 * Google Tag Manager — dataLayer helpers (script injection em GtmLoader).
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    __snatcherGtmLoaded?: string
  }
}

export function pushDataLayer(obj: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(obj)
}

const GTM_ID_RE = /^GTM-[A-Z0-9]+$/i

export function isValidGtmContainerId(id: string): boolean {
  return GTM_ID_RE.test(id.trim())
}

/** Injeta gtm.js uma vez por container (ID público). */
export function injectGoogleTagManager(containerId: string): void {
  if (typeof document === 'undefined') return
  const id = containerId.trim()
  if (!isValidGtmContainerId(id)) return
  const w = window
  if (w.__snatcherGtmLoaded === id) return

  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({ event: 'gtm.js', 'gtm.start': Date.now() })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
  w.__snatcherGtmLoaded = id
}

/** SPA — disparar no container GTM (mapear para GA4 Page View se quiseres). */
export function pushVirtualPageView(path: string, title: string): void {
  pushDataLayer({
    event: 'page_view',
    page_location: typeof window !== 'undefined' ? window.location.href : '',
    page_path: path,
    page_title: title,
  })
}

/** GA4 ecommerce — linha expandida no catálogo. */
export function pushCatalogProductView(payload: {
  id: number
  title: string
  brand?: string
  price: number
  category?: string
  source?: string
  curation_status?: string
}): void {
  pushDataLayer({ ecommerce: null })
  pushDataLayer({
    event: 'view_item',
    ecommerce: {
      currency: 'BRL',
      value: payload.price,
      items: [
        {
          item_id: String(payload.id),
          item_name: payload.title,
          item_brand: payload.brand || undefined,
          item_category: payload.category || undefined,
          price: payload.price,
          quantity: 1,
        },
      ],
    },
    snatcher_product_source: payload.source,
    snatcher_curation_status: payload.curation_status,
  })
}

/** Página Analytics — métricas do período (custom event no GTM). */
export function pushAnalyticsSummary(extra: Record<string, unknown>): void {
  pushDataLayer({
    event: 'snatcher_analytics_summary',
    ...extra,
  })
}
