import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, EmptyState, Skeleton, Input } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface WAAccount {
  id: number
  name: string
  status: string
  active: boolean
}

interface WAGroup {
  id: string
  name: string
  size: number
}

// ── Modal criar grupo ────────────────────────────────────────────────────────
function CreateGroupModal({
  accounts,
  onClose,
}: {
  accounts: WAAccount[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', accountId: accounts[0]?.id?.toString() ?? '' })
  const [saving, setSaving] = useState(false)

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/accounts/wa/${form.accountId}/groups`, { name: form.name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-groups'] })
      onClose()
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error ?? 'Erro ao criar grupo')
      setSaving(false)
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.accountId) return
    setSaving(true)
    createMut.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-fg mb-4">Criar grupo WhatsApp</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Nome do grupo *</label>
            <Input
              required
              placeholder="Ex: Promos Tech BR"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Conta WhatsApp *</label>
            <select
              required
              value={form.accountId}
              onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Criar grupo
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Seção de grupos por conta ────────────────────────────────────────────────
function AccountGroups({ account }: { account: WAAccount }) {
  const { data: groups = [], isLoading } = useQuery<WAGroup[]>({
    queryKey: ['wa-groups', account.id],
    queryFn: () =>
      apiClient.get(`/api/accounts/wa/${account.id}/groups`).then(r =>
        Array.isArray(r.data) ? r.data : []
      ),
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <p className="text-sm font-semibold text-fg">{account.name}</p>
        <Badge variant={account.status === 'connected' ? 'success' : 'default'} size="sm">
          {account.status === 'connected' ? '● conectada' : account.status}
        </Badge>
        {!isLoading && (
          <span className="text-xs text-fg-3">{groups.length} grupo{groups.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-fg-3 bg-surface-2 rounded-md px-4 py-3">
          {account.status === 'connected'
            ? 'Aguardando sync de grupos... (pode levar alguns segundos)'
            : 'Conta desconectada — conecte via QR para ver os grupos.'
          }
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium uppercase tracking-wide">Grupo</th>
                <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium uppercase tracking-wide">Membros</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-fg">{g.name || '(sem nome)'}</p>
                    <p className="text-xs text-fg-3 font-mono truncate max-w-xs">{g.id}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-fg font-medium">{g.size > 0 ? g.size.toLocaleString('pt-BR') : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Groups() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const { data: accounts = [], isLoading } = useQuery<WAAccount[]>({
    queryKey: ['accounts', 'wa'],
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 30_000,
  })

  const activeAccounts = accounts.filter(a => a.active)
  const filtered = search
    ? activeAccounts.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : activeAccounts

  const connectedCount = accounts.filter(a => a.status === 'connected').length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-fg">Grupos WhatsApp</h1>
          <p className="text-sm text-fg-3 mt-0.5">
            {connectedCount} conta{connectedCount !== 1 ? 's' : ''} conectada{connectedCount !== 1 ? 's' : ''} ·
            grupos carregados da Evolution em tempo real
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={activeAccounts.length === 0}
          onClick={() => setShowCreate(true)}
        >
          + Criar grupo
        </Button>
      </div>

      {/* Filtro de conta (só se tiver mais de 1) */}
      {activeAccounts.length > 1 && (
        <div className="mb-6 w-72">
          <Input
            placeholder="Filtrar por conta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Conteúdo */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : activeAccounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta WhatsApp configurada"
          description="Conecte uma conta WhatsApp em Contas conectadas para ver e gerenciar grupos."
          cta={{ label: 'Ir para Contas conectadas', onClick: () => window.location.href = '/accounts' }}
        />
      ) : (
        filtered.map(account => (
          <AccountGroups key={account.id} account={account} />
        ))
      )}

      {/* Modal criar grupo */}
      {showCreate && activeAccounts.length > 0 && (
        <CreateGroupModal
          accounts={activeAccounts}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

// Necessário para React.SyntheticEvent no form
import React from 'react'
