import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Input, Tabs } from '../components/ui'
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
// Equipe Tab (placeholder — futuro)
// ───────────────────────────────────────

function TeamTab() {
  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-fg-3">
        Gerenciamento de equipe em breve. Aqui você poderá convidar operadores, gerenciar roles e ver último acesso.
      </p>
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
// Avançado Tab (placeholder)
// ───────────────────────────────────────

function AdvancedTab() {
  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-fg-3">
        Configurações avançadas (timezone, intervalo padrão, prefixos de grupo) em breve.
      </p>
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
