/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios'
import type {
  snatcher_backendv2_internal_models_SearchTerm,
  snatcher_backendv2_internal_models_CatalogProduct,
  snatcher_backendv2_internal_models_CatalogVariant,
  snatcher_backendv2_internal_models_Channel,
  internal_handlers_searchTermRequest,
  internal_handlers_channelRequest,
} from './types'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface GetProductsParams {
  limit?: number
  offset?: number
  [key: string]: any
}

interface GetCrawlResultsParams {
  limit?: number
  offset?: number
  [key: string]: any
}

interface GetCrawlLogsParams {
  limit?: number
  offset?: number
  [key: string]: any
}

interface GetCatalogProductsParams {
  limit?: number
  offset?: number
  [key: string]: any
}

interface UpdateCatalogProductData {
  [key: string]: any
}


// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const getToken = (): string | null => localStorage.getItem('ph_token')

// ────────────────────────────────────────────────────────────
// API Instance
// ────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { Authorization: getToken() ? `Bearer ${getToken()}` : undefined },
})

// ────────────────────────────────────────────────────────────
// Interceptors
// ────────────────────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    delete config.headers.Authorization
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError): Promise<AxiosError> => {
    if (err.response?.status === 401) {
      const url = err.config?.url || ''
      const isWAConfig = url.includes('/wa/') || url.includes('/config/wa')
      if (!isWAConfig) {
        localStorage.removeItem('ph_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// ────────────────────────────────────────────────────────────
// Groups
// ────────────────────────────────────────────────────────────

export const getGroups = (): Promise<any> => api.get('/groups').then(r => r.data)
export const getGroup = (id: string): Promise<any> => api.get(`/groups/${id}`).then(r => r.data)
export const createGroup = (data: any): Promise<any> => api.post('/groups', data).then(r => r.data)
export const updateGroup = (id: string, data: any): Promise<any> => api.put(`/groups/${id}`, data).then(r => r.data)
export const deleteGroup = (id: string): Promise<void> => api.delete(`/groups/${id}`)
export const triggerScan = (id: string): Promise<any> => api.post(`/groups/${id}/scan`).then(r => r.data)
export const createWAGroup = (id: string, participants: string[]): Promise<any> =>
  api.post(`/groups/${id}/create-wa-group`, { participants }).then(r => r.data)

// ────────────────────────────────────────────────────────────
// Products
// ────────────────────────────────────────────────────────────

export const getProducts = (groupId: string, params: GetProductsParams = {}): Promise<any> =>
  api.get(`/groups/${groupId}/products`, { params }).then(r => r.data)
export const getAllProducts = (params: GetProductsParams = {}): Promise<any> =>
  api.get('/products', { params }).then(r => r.data)
export const deleteProduct = (id: string): Promise<void> => api.delete(`/products/${id}`)
export const sendProduct = (id: string): Promise<any> => api.post(`/products/${id}/send`).then(r => r.data)
export const getProductHistory = (id: string): Promise<any> => api.get(`/products/${id}/history`).then(r => r.data)

// ────────────────────────────────────────────────────────────
// Scan
// ────────────────────────────────────────────────────────────

export const getScanJobs = (): Promise<any> => api.get('/scan/jobs').then(r => r.data)
export const getScanStatus = (): Promise<any> => api.get('/scan/status').then(r => r.data)

// ────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────

export const getConfig = (): Promise<any> => api.get('/config').then(r => r.data)
export const updateConfig = (data: any): Promise<any> => api.put('/config', data).then(r => r.data)
export const testWA = (): Promise<any> => api.post('/config/test-wa').then(r => r.data)
export const getWAStatus = (): Promise<any> => api.get('/config/wa/status').then(r => r.data)
export const startWASession = (): Promise<any> => api.post('/config/wa/session/start').then(r => r.data)
export const logoutWASession = (): Promise<any> => api.post('/config/wa/session/logout').then(r => r.data)
export const getWAGroups = (): Promise<any> => api.get('/config/wa/groups').then(r => r.data)
export const createWAGroupDirect = (name: string): Promise<any> => api.post('/config/wa/groups', { name }).then(r => r.data)
export const getWAGroupInvite = (groupId: string): Promise<any> =>
  api.get(`/config/wa/groups/${encodeURIComponent(groupId)}/invite`).then(r => r.data)
export const updateWAGroup = (groupId: string, data: any): Promise<any> =>
  api.put(`/config/wa/groups/${encodeURIComponent(groupId)}`, data).then(r => r.data)
export const leaveWAGroup = (groupId: string): Promise<void> =>
  api.delete(`/config/wa/groups/${encodeURIComponent(groupId)}`)

// ────────────────────────────────────────────────────────────
// Telegram
// ────────────────────────────────────────────────────────────

export const getTGStatus = (): Promise<any> => api.get('/config/tg/status').then(r => r.data)
export const testTG = (): Promise<any> => api.post('/config/tg/test').then(r => r.data)
export const getTGChats = (linked: boolean): Promise<any> =>
  api.get('/config/tg/chats', { params: { linked } }).then(r => r.data)
export const resolveTGChat = (handle: string): Promise<any> =>
  api.post('/config/tg/chats/resolve', { handle }).then(r => r.data)
export const linkTGChat = (chatId: string, groupId: string): Promise<any> =>
  api.post(`/config/tg/chats/${encodeURIComponent(chatId)}/link`, { group_id: groupId }).then(r => r.data)
export const unlinkTGChat = (chatId: string): Promise<void> =>
  api.delete(`/config/tg/chats/${encodeURIComponent(chatId)}/link`)
export const setTGTitle = (chatId: string, title: string): Promise<any> =>
  api.put(`/config/tg/chats/${encodeURIComponent(chatId)}/title`, { title }).then(r => r.data)
export const getTGInvite = (chatId: string): Promise<any> =>
  api.get(`/config/tg/chats/${encodeURIComponent(chatId)}/invite`).then(r => r.data)
export const leaveTGChat = (chatId: string): Promise<void> =>
  api.delete(`/config/tg/chats/${encodeURIComponent(chatId)}`)
export const getTGDeeplink = (): Promise<any> => api.get('/config/tg/deeplink').then(r => r.data)

// ────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────

export const getAnalyticsSummary = (days: number = 30): Promise<any> =>
  api.get('/analytics/summary', { params: { days } }).then(r => r.data)
export const getAnalyticsByGroup = (days: number = 30): Promise<any> =>
  api.get('/analytics/by-group', { params: { days } }).then(r => r.data)

// ────────────────────────────────────────────────────────────
// v2 — Search Terms (Crawlers)
// ────────────────────────────────────────────────────────────

export const getSearchTerms = (): Promise<snatcher_backendv2_internal_models_SearchTerm[]> =>
  api.get('/search-terms').then(r => r.data)
export const createSearchTerm = (data: internal_handlers_searchTermRequest): Promise<snatcher_backendv2_internal_models_SearchTerm> =>
  api.post('/search-terms', data).then(r => r.data)
export const updateSearchTerm = (id: string, data: internal_handlers_searchTermRequest): Promise<snatcher_backendv2_internal_models_SearchTerm> =>
  api.put(`/search-terms/${id}`, data).then(r => r.data)
export const deleteSearchTerm = (id: string): Promise<void> => api.delete(`/search-terms/${id}`)
export const crawlSearchTerm = (id: string): Promise<any> => api.post(`/search-terms/${id}/crawl`).then(r => r.data)
export const getCrawlResults = (termId: string, params: GetCrawlResultsParams = {}): Promise<any> =>
  api.get(`/search-terms/${termId}/results`, { params }).then(r => r.data)
export const getCrawlLogs = (params: GetCrawlLogsParams = {}): Promise<any> =>
  api.get('/crawl-logs', { params }).then(r => r.data)

// ────────────────────────────────────────────────────────────
// v2 — Catalog
// ────────────────────────────────────────────────────────────

export const getCatalogProducts = (params: GetCatalogProductsParams = {}): Promise<snatcher_backendv2_internal_models_CatalogProduct[]> =>
  api.get('/catalog', { params }).then(r => r.data)
export const getCatalogProduct = (id: string): Promise<snatcher_backendv2_internal_models_CatalogProduct> =>
  api.get(`/catalog/${id}`).then(r => r.data)
export const updateCatalogProduct = (id: string, data: UpdateCatalogProductData): Promise<snatcher_backendv2_internal_models_CatalogProduct> =>
  api.put(`/catalog/${id}`, data).then(r => r.data)
export const getCatalogVariants = (productId: string): Promise<snatcher_backendv2_internal_models_CatalogVariant[]> =>
  api.get(`/catalog/${productId}/variants`).then(r => r.data)
export const getVariantHistory = (variantId: string): Promise<any> =>
  api.get(`/catalog/variants/${variantId}/history`).then(r => r.data)
export const getKeywords = (): Promise<any> => api.get('/catalog/keywords').then(r => r.data)
export const createKeyword = (data: any): Promise<any> => api.post('/catalog/keywords', data).then(r => r.data)
export const deleteKeyword = (id: string): Promise<void> => api.delete(`/catalog/keywords/${id}`)

// ────────────────────────────────────────────────────────────
// v2 — Channels
// ────────────────────────────────────────────────────────────

export const getChannels = (): Promise<snatcher_backendv2_internal_models_Channel[]> =>
  api.get('/channels').then(r => r.data)
export const createChannel = (data: internal_handlers_channelRequest): Promise<snatcher_backendv2_internal_models_Channel> =>
  api.post('/channels', data).then(r => r.data)
export const getChannel = (id: string): Promise<snatcher_backendv2_internal_models_Channel> =>
  api.get(`/channels/${id}`).then(r => r.data)
export const updateChannel = (id: string, data: internal_handlers_channelRequest): Promise<snatcher_backendv2_internal_models_Channel> =>
  api.put(`/channels/${id}`, data).then(r => r.data)
export const deleteChannel = (id: string): Promise<void> => api.delete(`/channels/${id}`)
export const addChannelTarget = (channelId: string, data: any): Promise<any> =>
  api.post(`/channels/${channelId}/targets`, data).then(r => r.data)
export const updateChannelTarget = (channelId: string, targetId: string, data: any): Promise<any> =>
  api.patch(`/channels/${channelId}/targets/${targetId}`, data).then(r => r.data)
export const removeChannelTarget = (channelId: string, targetId: string): Promise<void> =>
  api.delete(`/channels/${channelId}/targets/${targetId}`)
export const addChannelRule = (channelId: string, data: any): Promise<any> =>
  api.post(`/channels/${channelId}/rules`, data).then(r => r.data)
export const updateChannelRule = (channelId: string, ruleId: string, data: any): Promise<any> =>
  api.put(`/channels/${channelId}/rules/${ruleId}`, data).then(r => r.data)
export const deleteChannelRule = (channelId: string, ruleId: string): Promise<void> =>
  api.delete(`/channels/${channelId}/rules/${ruleId}`)
export const sendChannelDigest = (channelId: string): Promise<any> =>
  api.post(`/channels/${channelId}/send-digest`).then(r => r.data)
export const sendChannelProduct = (channelId: string, productId: string): Promise<any> =>
  api.post(`/channels/${channelId}/send-product`, { product_id: productId }).then(r => r.data)

// ────────────────────────────────────────────────────────────
// v2 — Accounts (multi-WA/TG)
// ────────────────────────────────────────────────────────────

export const getWAHealth = (): Promise<any> => api.get('/accounts/wa/health').then(r => r.data)
export const getWAAccounts = (): Promise<any> => api.get('/accounts/wa').then(r => r.data)
export const createWAAccount = (data: any): Promise<any> => api.post('/accounts/wa', data).then(r => r.data)
export const updateWAAccount = (id: string, data: any): Promise<any> =>
  api.put(`/accounts/wa/${id}`, data).then(r => r.data)
export const deleteWAAccount = (id: string): Promise<void> => api.delete(`/accounts/wa/${id}`)
export const getWAAccountStatus = (id: string): Promise<any> => api.get(`/accounts/wa/${id}/status`).then(r => r.data)
export const getWAAccountGroups = (id: string): Promise<any> => api.get(`/accounts/wa/${id}/groups`).then(r => r.data)
export const createWAAccountGroup = (id: string, name: string): Promise<any> =>
  api.post(`/accounts/wa/${id}/groups`, { name }).then(r => r.data)
export const leaveWAAccountGroup = (id: string, groupId: string): Promise<void> =>
  api.delete(`/accounts/wa/${id}/groups/${encodeURIComponent(groupId)}`)
export const testWAAccount = (id: string): Promise<any> => api.post(`/accounts/wa/${id}/test`).then(r => r.data)
export const startWAAccountSession = (id: string): Promise<any> =>
  api.post(`/accounts/wa/${id}/session/start`).then(r => r.data)
export const logoutWAAccount = (id: string): Promise<any> => api.post(`/accounts/wa/${id}/session/logout`).then(r => r.data)

export const getTGAccounts = (): Promise<any> => api.get('/accounts/tg').then(r => r.data)
export const createTGAccount = (data: any): Promise<any> => api.post('/accounts/tg', data).then(r => r.data)
export const updateTGAccount = (id: string, data: any): Promise<any> =>
  api.put(`/accounts/tg/${id}`, data).then(r => r.data)
export const deleteTGAccount = (id: string): Promise<void> => api.delete(`/accounts/tg/${id}`)
export const testTGAccount = (id: string): Promise<any> => api.post(`/accounts/tg/${id}/test`).then(r => r.data)

// ────────────────────────────────────────────────────────────
// Sources
// ────────────────────────────────────────────────────────────

export const getSources = (): Promise<any> => api.get('/sources').then(r => r.data)

// ────────────────────────────────────────────────────────────
// Broadcast
// ────────────────────────────────────────────────────────────

export const getBroadcasts = (): Promise<any> => api.get('/broadcast').then(r => r.data)
export const sendBroadcast = (data: any): Promise<any> => api.post('/broadcast', data).then(r => r.data)
export const deleteBroadcast = (id: string): Promise<void> => api.delete(`/broadcast/${id}`).then(r => r.data)

// ────────────────────────────────────────────────────────────
// Coverage (Fase 11)
// ────────────────────────────────────────────────────────────

export const getCoverage = (): Promise<any> => api.get('/coverage').then(r => r.data)
export const postCoverageSync = (data: any): Promise<any> => api.post('/coverage/sync', data).then(r => r.data)

// ────────────────────────────────────────────────────────────
// Default export
// ────────────────────────────────────────────────────────────

export default api
