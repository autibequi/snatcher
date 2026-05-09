import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from '../components/ui'
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
      navigate('/login', { state: { message: 'Conta criada! Faça login para continuar.' } })
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
          <Input
            label="Nome"
            type="text"
            autoFocus
            required
            placeholder="Seu nome"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />

          <Input
            label="E-mail"
            type="email"
            required
            placeholder="admin@seudominio.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />

          <Input
            label="Senha"
            type="password"
            required
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />

          <Input
            label="Confirmar senha"
            type="password"
            required
            placeholder="Repita a senha"
            value={form.confirm}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
          />

          {error && (
            <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            {loading ? 'Criando conta...' : 'Criar conta de administrador'}
          </Button>
        </form>

        <p className="text-xs text-center text-fg-3 mt-6">
          Esta opção só está disponível no primeiro acesso.
        </p>
      </div>
    </div>
  )
}
