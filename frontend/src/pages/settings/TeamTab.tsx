import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Skeleton, EmptyState } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { tableContainer, tableHeaderCell, tableRow, tableCell, tableCellMuted } from '../../lib/uiTokens'

export function TeamTab() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'operator' })

  const { data: team = [], isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => apiClient.get('/api/team').then(r => Array.isArray(r.data) ? r.data : []),
  })

  const createMut = useMutation({
    mutationFn: () => apiClient.post('/api/team', form).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      setShowCreate(false)
      setForm({ email: '', password: '', name: '', role: 'operator' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/team/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiClient.patch(`/api/team/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-md font-semibold text-fg">Equipe</h2>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ Convidar operador</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : team.length === 0 ? (
        <EmptyState title="Nenhum operador" />
      ) : (
        <div className={tableContainer}>
          <table className="w-full text-sm bg-surface min-w-[520px]">
            <thead>
              <tr className="border-b border-border">
                {['Nome', 'Email', 'Role', 'Ultimo login', 'Acoes'].map(h => (
                  <th key={h} className={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((u: any) => (
                <tr key={u.id} className={tableRow}>
                  <td className={tableCell}>{u.name || '-'}</td>
                  <td className={tableCellMuted}>{u.email}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role}
                      onChange={e => roleMut.mutate({ id: u.id, role: e.target.value })}
                      className="text-xs bg-surface-2 border border-border rounded px-2 py-1"
                    >
                      <option value="operator">operator</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className={tableCellMuted}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString('pt-BR') : 'nunca'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button variant="ghost" size="sm"
                      onClick={() => { if (confirm(`Remover ${u.email}?`)) deleteMut.mutate(u.id) }}>
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-modal">
            <h3 className="font-semibold mb-3">Convidar operador</h3>
            <div className="space-y-3">
              <Input label="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input label="Email" type="email" required value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input label="Senha" type="password" required value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
              <div>
                <label className="text-xs font-medium text-fg-2">Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full mt-1 h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent">
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button variant="primary" loading={createMut.isPending} onClick={() => createMut.mutate()}>Criar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
