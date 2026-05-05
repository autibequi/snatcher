import React from 'react'
import axios from 'axios'

interface User {
  id: number
  email: string
  name?: string
  role: 'operator' | 'admin'
}

interface AuthState {
  user: User | null
  accessToken: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  setAccessToken: (token: string) => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

const ACCESS_KEY = 'snatcher.access_token'
const REFRESH_KEY = 'snatcher.refresh_token'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(() => ({
    user: null,
    accessToken: sessionStorage.getItem(ACCESS_KEY),
  }))

  // Carregar usuário do token ao montar
  React.useEffect(() => {
    const token = sessionStorage.getItem(ACCESS_KEY)
    if (!token) return
    axios
      .get<User>('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setState({ user: res.data, accessToken: token }))
      .catch(() => {
        sessionStorage.removeItem(ACCESS_KEY)
        setState({ user: null, accessToken: null })
      })
  }, [])

  // Escutar evento auth:logout disparado pelo apiClient quando refresh falha
  React.useEffect(() => {
    const handleLogout = () => {
      setState({ user: null, accessToken: null })
    }
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  const login = async (email: string, password: string) => {
    const res = await axios.post<{ access_token: string; refresh_token: string; user: User }>(
      '/api/auth/login',
      { email, password }
    )
    const accessToken = res.data.access_token
    const refreshToken = res.data.refresh_token
    sessionStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
    setState({ user: res.data.user, accessToken })
  }

  const logout = () => {
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (refresh) {
      axios.post('/api/auth/logout', { refreshToken: refresh }).catch(() => {})
    }
    sessionStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setState({ user: null, accessToken: null })
  }

  const setAccessToken = (token: string) => {
    sessionStorage.setItem(ACCESS_KEY, token)
    setState(prev => ({ ...prev, accessToken: token }))
  }

  return (
    <AuthContext.Provider
      value={{ ...state, login, logout, isAuthenticated: !!state.accessToken, setAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
