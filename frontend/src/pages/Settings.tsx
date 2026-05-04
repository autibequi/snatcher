import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Tabs, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useTheme } from '../lib/theme'

const TABS = [
  { id: 'appearance', label: 'Aparência' },
  { id: 'team', label: 'Equipe' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'advanced', label: 'Avançado' },
]

// ───────────────────────────────────────
// Aparência Tab
// ───────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme, density, setDensity, accent, setAccent } = useTheme()

  return (
    <div className="space-y-6 max-w-sm">
      {/* Tema Light/Dark */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">Tema</p>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                theme === t
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-fg-2 hover:bg-border border border-border'
              }`}
            >
              {t === 'light' ? '☀️ Claro' : '🌙 Escuro'}
            </button>
          ))}
        </div>
      </div>

      {/* Densidade */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">Densidade</p>
        <div className="flex gap-2">
          {(['compact', 'comfy'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                density === d
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-fg-2 hover:bg-border border border-border'
              }`}
            >
              {d === 'compact' ? 'Compacto' : 'Confortável'}
            </button>
          ))}
        </div>
      </div>

      {/* Acento */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">Cor de Acento</p>
        <div className="flex gap-3">
          {(['indigo', 'green', 'orange', 'pink'] as const).map((a) => {
            const colors: Record<string, string> = {
              indigo: '#6366f1',
              green: '#22c55e',
              orange: '#f97316',
              pink: '#ec4899',
            }
            return (
              <button
                key={a}
                onClick={() => setAccent(a)}
                className={`w-8 h-8 rounded-full border-2 transition-colors ${
                  accent === a ? 'border-fg' : 'border-transparent'
                }`}
                style={{ backgroundColor: colors[a] }}
                title={a.charAt(0).toUpperCase() + a.slice(1)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────
// Equipe Tab
// ───────────────────────────────────────

function TeamTab() {
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

      {isLoading ? <Skeleton className="h-20" /> : team.length === 0 ? (
        <EmptyState title="Nenhum operador" />
      ) : (
        <table className="w-full text-sm bg-surface border border-border rounded-md">
          <thead>
            <tr className="border-b border-border">
              {['Nome', 'Email', 'Role', 'Último login', 'Ações'].map(h =>
                <th key={h} className="text-left p-3 text-fg-2 font-medium">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {team.map((u: any) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="p-3 text-fg">{u.name || '—'}</td>
                <td className="p-3 text-fg-2">{u.email}</td>
                <td className="p-3">
                  <select
                    value={u.role}
                    onChange={e => roleMut.mutate({ id: u.id, role: e.target.value })}
                    className="text-xs bg-surface-2 border border-border rounded px-2 py-1"
                  >
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-3 text-fg-3 text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('pt-BR') : 'nunca'}</td>
                <td className="p-3">
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (confirm(`Remover ${u.email}?`)) deleteMut.mutate(u.id)
                  }}>Remover</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-modal">
            <h3 className="font-semibold mb-3">Convidar operador</h3>
            <div className="space-y-3">
              <Input label="Nome" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <Input label="Email" type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              <Input label="Senha" type="password" required value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              <div>
                <label className="text-xs font-medium text-fg-2">Role</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full mt-1 h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent">
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

// ───────────────────────────────────────
// Integrações Tab
// ───────────────────────────────────────

function IntegrationsTab() {
  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then((r) => r.data).catch(() => ({})),
  })

  const save = useMutation({
    mutationFn: (data: Record<string, any>) => apiClient.patch('/api/config', data).then((r) => r.data),
  })

  const [form, setForm] = useState<Record<string, string>>({})

  const get = (k: string) => form[k] ?? (config?.[k] ?? '')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  if (isLoading && !config) {
    return <div className="text-sm text-fg-3">Carregando...</div>
  }

  return (
    <div className="space-y-6 max-w-md">
      {/* WhatsApp */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">WhatsApp (Evolution API)</p>
        <div className="space-y-2">
          <Input
            label="Base URL"
            value={get('wa_base_url')}
            onChange={(e) => set('wa_base_url', e.target.value)}
            placeholder="http://evolution:8080"
          />
          <Input
            label="API Key"
            value={get('wa_api_key')}
            onChange={(e) => set('wa_api_key', e.target.value)}
            type="password"
            placeholder="••••••••••"
          />
          <Input
            label="Instância"
            value={get('wa_instance')}
            onChange={(e) => set('wa_instance', e.target.value)}
            placeholder="default"
          />
        </div>
      </div>

      {/* Telegram */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">Telegram Bot</p>
        <div className="space-y-2">
          <Input
            label="Bot Token"
            value={get('tg_bot_token')}
            onChange={(e) => set('tg_bot_token', e.target.value)}
            type="password"
            placeholder="••••••••••"
          />
          <Input
            label="Bot Username"
            value={get('tg_bot_username')}
            onChange={(e) => set('tg_bot_username', e.target.value)}
            placeholder="@meu_bot"
          />
        </div>
      </div>

      {/* LLM */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">LLM (OpenRouter)</p>
        <div className="space-y-2">
          <Input
            label="API Key"
            value={get('openrouter_api_key')}
            onChange={(e) => set('openrouter_api_key', e.target.value)}
            type="password"
            placeholder="sk-or-..."
          />
        </div>
      </div>

      {/* Salvar */}
      <Button
        variant="primary"
        size="sm"
        loading={save.isPending}
        onClick={() => {
          const payload = Object.keys(form).reduce(
            (acc, k) => {
              if (form[k]) acc[k] = form[k]
              return acc
            },
            {} as Record<string, string>
          )
          save.mutate(payload)
        }}
      >
        Salvar configurações
      </Button>

      {save.isSuccess && (
        <p className="text-xs text-green-400">Configurações salvas com sucesso!</p>
      )}
      {save.isError && (
        <p className="text-xs text-red-400">Erro ao salvar. Tente novamente.</p>
      )}
    </div>
  )
}

// ───────────────────────────────────────
// Avançado Tab
// ───────────────────────────────────────

interface AppConfig {
  global_interval?: number
  send_start_hour?: number
  send_end_hour?: number
  wa_group_prefix?: string
  tg_group_prefix?: string
  use_short_links?: boolean
  [key: string]: unknown
}

function AdvancedTab() {
  const qc = useQueryClient()
  const [localConfig, setLocalConfig] = useState<Partial<AppConfig>>({})

  const { data: config, isLoading } = useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then((r) => r.data).catch(() => ({})),
  })

  const saveConfig = useMutation({
    mutationFn: (data: Partial<AppConfig>) =>
      apiClient.patch('/api/config', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setLocalConfig({})
    },
  })

  const updateField = (key: keyof AppConfig, value: unknown) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }))
  }

  const merged: AppConfig = { ...config, ...localConfig }

  if (isLoading && !config) {
    return <div className="text-sm text-fg-3">Carregando...</div>
  }

  return (
    <div className="max-w-md space-y-4">
      <h3 className="text-sm font-medium text-fg">Configurações avançadas</h3>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Intervalo de scan (minutos)</label>
        <input
          type="number"
          min={5}
          max={1440}
          value={merged.global_interval ?? 30}
          onChange={(e) => updateField('global_interval', Number(e.target.value))}
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-fg-2 block mb-1">Início do envio (hora)</label>
          <input
            type="number"
            min={0}
            max={23}
            value={merged.send_start_hour ?? 8}
            onChange={(e) => updateField('send_start_hour', Number(e.target.value))}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Fim do envio (hora)</label>
          <input
            type="number"
            min={0}
            max={23}
            value={merged.send_end_hour ?? 22}
            onChange={(e) => updateField('send_end_hour', Number(e.target.value))}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Prefixo grupo WhatsApp</label>
        <input
          value={(merged.wa_group_prefix as string) ?? ''}
          onChange={(e) => updateField('wa_group_prefix', e.target.value)}
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
        />
      </div>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Prefixo grupo Telegram</label>
        <input
          value={(merged.tg_group_prefix as string) ?? ''}
          onChange={(e) => updateField('tg_group_prefix', e.target.value)}
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={(merged.use_short_links as boolean) ?? true}
          onChange={(e) => updateField('use_short_links', e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm text-fg">Usar links encurtados nos disparos</span>
      </label>

      <Button
        variant="primary"
        size="sm"
        loading={saveConfig.isPending}
        onClick={() => saveConfig.mutate(localConfig)}
      >
        Salvar configurações avançadas
      </Button>

      {saveConfig.isSuccess && (
        <p className="text-xs text-green-400">Configurações salvas com sucesso!</p>
      )}
      {saveConfig.isError && (
        <p className="text-xs text-red-400">Erro ao salvar. Tente novamente.</p>
      )}
    </div>
  )
}

// ───────────────────────────────────────
// Main Component
// ───────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState('appearance')

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-fg mb-6">Configurações</h1>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        <div className="p-6">
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'advanced' && <AdvancedTab />}
        </div>
      </div>
    </div>
  )
}
