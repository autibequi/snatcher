import React, { useState, FC, ChangeEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

interface LoginForm {
  email: string
  password: string
}

const Login: FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  const [form, setForm] = useState<LoginForm>({ email: '', password: '' })
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const submit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(form.email, form.password)
      navigate(from, { replace: true })
    } catch {
      setError('Usuário ou senha incorretos')
    } finally {
      setLoading(false)
    }
  }

  const field = 'w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg placeholder-fg-3 focus:outline-none focus:border-accent transition-colors'

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-fg mt-2">Promo Snatcher</h1>
          <p className="text-fg-3 text-sm mt-1">Entre para continuar</p>
        </div>
        <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-fg-2 mb-1.5">E-mail</label>
            <input
              className={field}
              type="email"
              value={form.email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="admin@exemplo.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-fg-2 mb-1.5">Senha</label>
            <input
              className={field}
              type="password"
              value={form.password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-fg font-medium py-3 rounded-md transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
