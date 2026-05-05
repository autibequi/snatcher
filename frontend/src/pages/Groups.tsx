import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, EmptyState, Skeleton, Input } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface WAAccount { id: number; name: string; status: string; active: boolean }
interface TGAccount { id: number; name: string; bot_username?: any; active: boolean; role: string }
interface WAGroup { id: string; name: string; size: number }
interface TGChat { chat_id: string; title: string; type: string; member_count?: number; is_admin?: boolean }

// ── Modal criar grupo WA ──────────────────────────────────────────────────────
function CreateWAGroupModal({ accounts, onClose }: { accounts: WAAccount[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', accountId: accounts[0]?.id?.toString() ?? '' })
  const createMut = useMutation({
    mutationFn: () => apiClient.post(`/api/accounts/wa/${form.accountId}/groups`, { name: form.name }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-groups'] }); onClose() },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao criar grupo'),
  })
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-5 w-full max-w-sm shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="font-medium text-fg mb-4">Criar grupo WhatsApp</h3>
        <div className="space-y-3">
          <input autoFocus className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="Nome do grupo..." value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          {accounts.length > 1 && (
            <select className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
              value={form.accountId} onChange={e => setForm(f => ({...f, accountId: e.target.value}))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={createMut.isPending} disabled={!form.name.trim()} onClick={() => createMut.mutate()}>Criar</Button>
        </div>
      </div>
    </div>
  )
}

// ── Seção WA por conta ─────────────────────────────────────────────────────────
function WAAccountSection({ account, search }: { account: WAAccount; search: string }) {
  const { data: groups = [], isLoading } = useQuery<WAGroup[]>({
    queryKey: ['wa-groups', account.id],
    queryFn: () => apiClient.get(`/api/accounts/wa/${account.id}/groups`).then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 30_000, staleTime: 20_000,
  })
  const filtered = search ? groups.filter(g => g.name?.toLowerCase().includes(search.toLowerCase())) : groups

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-bold text-fg-3 uppercase">WA</span>
        <span className="text-sm font-medium text-fg">{account.name}</span>
        <Badge variant={account.status === 'connected' ? 'success' : 'default'} size="sm">
          {account.status === 'connected' ? '● conectada' : account.status}
        </Badge>
        {!isLoading && <span className="text-xs text-fg-3">{filtered.length} grupos</span>}
      </div>
      {isLoading ? (
        <div className="space-y-1.5">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
          <p className="text-xs text-fg-3 px-1 pt-1 flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Carregando grupos da Evolution API...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-fg-3 px-1 py-2">
          {account.status !== 'connected'
            ? 'Conta desconectada — conecte via QR para ver os grupos.'
            : groups.length === 0
            ? '⟳ Aguardando sincronização com a Evolution... (pode levar alguns segundos)'
            : 'Nenhum grupo encontrado com esse filtro.'}
        </p>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2">
                    <p className="font-medium text-fg">{g.name || '(sem nome)'}</p>
                    <p className="text-xs text-fg-3 font-mono">{g.id}</p>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-fg-2">{g.size > 0 ? `${g.size.toLocaleString('pt-BR')} membros` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Seção TG ───────────────────────────────────────────────────────────────────
function TGSection({ accounts, search }: { accounts: TGAccount[]; search: string }) {
  const { data: chats = [], isLoading } = useQuery<TGChat[]>({
    queryKey: ['tg-chats'],
    queryFn: () => apiClient.get('/api/telegram/chats').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 60_000, staleTime: 30_000,
  })
  const filtered = search ? chats.filter(c => c.title?.toLowerCase().includes(search.toLowerCase())) : chats

  if (accounts.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-bold text-fg-3 uppercase">TG</span>
        <span className="text-sm font-medium text-fg">Telegram</span>
        <Badge variant="default" size="sm">{accounts.length} conta{accounts.length!==1?'s':''}</Badge>
        {!isLoading && <span className="text-xs text-fg-3">{filtered.length} chats</span>}
      </div>
      {isLoading ? (
        <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-fg-3 px-1 py-2">
          {chats.length === 0 ? 'Nenhum chat TG descoberto. Configure o bot token em Configurações.' : 'Nenhum chat encontrado.'}
        </p>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {filtered.map(c => (
                <tr key={c.chat_id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2">
                    <p className="font-medium text-fg">{c.title}</p>
                    <p className="text-xs text-fg-3">{c.type} · {c.chat_id}</p>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-fg-2">
                    {c.member_count ? `${c.member_count} membros` : '—'}
                    {c.is_admin && <span className="ml-1 text-accent">admin</span>}
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

// ── Página principal ──────────────────────────────────────────────────────────
export default function Groups() {
  const [showCreateWA, setShowCreateWA] = useState(false)
  const [search, setSearch] = useState('')

  const { data: waAccounts = [], isLoading: waLoading } = useQuery<WAAccount[]>({
    queryKey: ['accounts', 'wa'],
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 60_000,
  })

  const { data: tgAccounts = [], isLoading: tgLoading } = useQuery<TGAccount[]>({
    queryKey: ['accounts', 'tg'],
    queryFn: () => apiClient.get('/api/accounts/tg').then(r => Array.isArray(r.data) ? r.data : []),
  })

  const activeWA = waAccounts.filter(a => a.active)
  const activeTG = tgAccounts.filter(a => a.active)
  const connectedWA = waAccounts.filter(a => a.status === 'connected').length
  const isLoading = waLoading || tgLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-fg">Grupos</h1>
          <p className="text-sm text-fg-3 mt-0.5">
            {connectedWA} WA conectada{connectedWA!==1?'s':''} · {activeTG.length} TG configurada{activeTG.length!==1?'s':''}
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={activeWA.length===0} onClick={() => setShowCreateWA(true)}>
          + Criar grupo WA
        </Button>
      </div>

      {(activeWA.length > 1 || activeTG.length > 0) && (
        <div className="mb-4 w-64">
          <Input placeholder="Buscar grupo/chat..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[1,2].map(i => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : activeWA.length === 0 && activeTG.length === 0 ? (
        <EmptyState
          title="Nenhuma conta configurada"
          description="Conecte uma conta WhatsApp ou Telegram em Contas conectadas."
          cta={{ label: 'Ir para Contas', onClick: () => window.location.href = '/accounts' }}
        />
      ) : (
        <>
          {activeWA.map(account => (
            <WAAccountSection key={account.id} account={account} search={search} />
          ))}
          <TGSection accounts={activeTG} search={search} />
        </>
      )}

      {showCreateWA && activeWA.length > 0 && (
        <CreateWAGroupModal accounts={activeWA} onClose={() => setShowCreateWA(false)} />
      )}
    </div>
  )
}
