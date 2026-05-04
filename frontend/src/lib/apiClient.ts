import axios, { AxiosError } from 'axios'

const REFRESH_KEY = 'snatcher.refresh_token'
const ACCESS_KEY = 'snatcher.access_token'

export const apiClient = axios.create({
  baseURL: '/',
  timeout: 30_000,
})

// Injetar token em todas as requests
apiClient.interceptors.request.use(config => {
  const token = sessionStorage.getItem(ACCESS_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

function processQueue(token: string) {
  refreshQueue.forEach(cb => cb(token))
  refreshQueue = []
}

// Catch-all de erros: emite evento global pra UI mostrar toast
function emitApiError(error: AxiosError) {
  const status = error.response?.status
  const data = error.response?.data as { error?: string; message?: string } | undefined
  const url = error.config?.url ?? ''
  const method = error.config?.method?.toUpperCase() ?? 'GET'
  const msg = data?.error || data?.message || error.message || 'Erro desconhecido'
  // Não emitir 401 (interceptor de refresh trata)
  if (status === 401) return
  console.error(`[API ${status}] ${method} ${url}: ${msg}`, error.response?.data)
  window.dispatchEvent(new CustomEvent('api:error', {
    detail: { status, method, url, message: msg, data: error.response?.data },
  }))
}

// Renovar token em 401
apiClient.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _isRetry?: boolean }

    if (error.response?.status !== 401 || original?._isRetry) {
      emitApiError(error)
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push(token => {
          if (original) {
            original.headers = original.headers || {}
            original.headers.Authorization = `Bearer ${token}`
            resolve(token)
          } else {
            reject(error)
          }
        })
      }).then(token => {
        if (original) {
          original.headers!.Authorization = `Bearer ${token}`
          return apiClient(original)
        }
        return Promise.reject(error)
      })
    }

    isRefreshing = true
    original._isRetry = true

    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) {
      isRefreshing = false
      // Redirecionar para login — dispatch evento customizado escutado pelo AuthProvider
      window.dispatchEvent(new Event('auth:logout'))
      return Promise.reject(error)
    }

    try {
      const res = await axios.post<{ access_token: string; refresh_token: string }>(
        '/api/auth/refresh',
        { refresh_token: refreshToken }
      )
      const accessToken = res.data.access_token
      const newRefresh = res.data.refresh_token
      sessionStorage.setItem(ACCESS_KEY, accessToken)
      localStorage.setItem(REFRESH_KEY, newRefresh)

      processQueue(accessToken)
      isRefreshing = false

      if (original) {
        original.headers!.Authorization = `Bearer ${accessToken}`
        return apiClient(original)
      }
    } catch (refreshErr) {
      isRefreshing = false
      refreshQueue = []
      sessionStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
      window.dispatchEvent(new Event('auth:logout'))
      return Promise.reject(refreshErr)
    }
  }
)
