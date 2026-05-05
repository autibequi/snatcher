import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../lib/apiClient'

export default function Setup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (form.password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    setLoading(true)
    try {
      await apiClient.post('/api/setup/create-admin', {
        name: form.name,
        email: form.email,
        password: form.password,
      })
      navigate('/admin', { state: { message: 'Conta criada! Faça login para continuar.' } })
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-4">
            <span className="text-2xl font-bold text-white">S</span>
          </div>
          <h1 className="text-xl font-semibold text-fg">Configuração inicial</h1>
          <p className="text-sm text-fg-3 mt-1">Crie a conta de administrador para começar a usar o Snatcher.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Nome</label>
            <input
              type="text"
              autoFocus
              required
              placeholder="Seu nome"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-fg-2 block mb-1">E-mail</label>
            <input
              type="email"
              required
              placeholder="admin@seudominio.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-fg-2 block mb-1">Senha</label>
            <input
              type="password"
              required
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-fg-2 block mb-1">Confirmar senha</label>
            <input
              type="password"
              required
              placeholder="Repita a senha"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {loading ? 'Criando conta...' : 'Criar conta de administrador'}
          </button>
        </form>

        <p className="text-xs text-center text-fg-3 mt-6">
          Esta opção só está disponível no primeiro acesso.
        </p>
      </div>
    </div>
  )
}
