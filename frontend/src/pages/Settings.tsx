import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Tabs, Skeleton, EmptyState, SegmentedControl } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useTheme } from '../lib/theme'

/** Igual a softWipeConfirmPhrase no backend (danger.go); só o servidor valida. */
const SOFT_WIPE_CONFIRM_PHRASE =
  'EU CONFIRMO APAGAR TODOS OS DADOS OPERACIONAIS'

const TABS = [
  { id: 'general', label: 'Geral' },
  { id: 'appearance', label: 'Aparência' },
  { id: 'team', label: 'Equipe' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'llm', label: 'LLM / IA' },
  { id: 'branding', label: 'Domínio' },
  { id: 'danger', label: 'Danger zone' },
]

// ───────────────────────────────────────
// Aparência Tab
// ───────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme, density, setDensity, accent, setAccent } = useTheme()

  return (
    <div className="space-y-6 max-w-sm">
      {/* Tema Light/Dark/System */}
      <div>
        <p className="text-sm font-medium text-fg mb-1">Tema</p>
        <p className="text-xs text-fg-3 mb-3">"Sistema" segue a preferência do seu dispositivo (dark/light automaticamente).</p>
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: '🖥️ Sistema' },
            { value: 'light', label: '☀️ Claro' },
            { value: 'dark', label: '🌙 Escuro' },
          ]}
        />
      </div>

      {/* Densidade */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">Densidade</p>
        <SegmentedControl
          value={density}
          onChange={setDensity}
          options={[
            { value: 'compact', label: 'Compacto' },
            { value: 'comfy', label: 'Confortável' },
          ]}
        />
      </div>

      {/* Acento */}
      <div>
        <p className="text-sm font-medium text-fg mb-3">Cor de Acento</p>
        <div className="flex gap-3">
          {(['indigo', 'green', 'orange', 'pink'] as const).map((a) => {
            const colors: Record<string, string> = {
              indigo: '#bd93f9',
              green: '#50fa7b',
              orange: '#ffb86c',
              pink: '#ff79c6',
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
    mutationFn: (data: Record<string, any>) => apiClient.put('/api/config', data).then((r) => r.data),
  })

  const [form, setForm] = useState<Record<string, string>>({})

  const get = (k: string) => form[k] ?? (config?.[k] ?? '')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  if (isLoading && !config) {
    return <div className="text-sm text-fg-3">Carregando...</div>
  }

  return (
    <div className="space-y-6 max-w-md">
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
// LLM / IA Tab
// ───────────────────────────────────────

function LLMTab() {
  const qc = useQueryClient()
  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data),
  })

  const get = (key: string) => {
    const v = config?.[key]
    return typeof v === 'object' ? v?.String || '' : v || ''
  }

  const [form, setForm] = useState<Record<string, string>>({})
  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  const saveMut = useMutation({
    mutationFn: () => {
      // Coerce string-encoded booleans dos campos com checkbox antes de enviar pro backend.
      const payload: Record<string, unknown> = { ...config, ...form }
      const boolFields = [
        'llm_reasoning_ollama',
        'llm_reasoning_vllm',
        'llm_reasoning_openrouter',
      ]
      for (const k of boolFields) {
        if (payload[k] === 'true') payload[k] = true
        else if (payload[k] === 'false') payload[k] = false
      }
      const rawTemp = payload.llm_temperature
      if (rawTemp === '' || rawTemp === undefined || rawTemp === null) {
        payload.llm_temperature = null
      } else if (typeof rawTemp === 'string') {
        const n = Number(rawTemp)
        payload.llm_temperature = Number.isFinite(n) ? n : null
      }
      return apiClient.put('/api/config', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); setForm({}) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const provider = form.llm_provider ?? get('llm_provider') ?? 'openrouter'

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />)}</div>

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <p className="text-sm font-semibold text-fg mb-1">Provider de IA</p>
        <p className="text-xs text-fg-3 mb-3">Usado para gerar copy de disparos, categorizar produtos e labels de clusters.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'openrouter', label: 'OpenRouter', desc: 'API cloud — vários modelos (GPT-4o-mini, Claude, etc.)' },
            { id: 'ollama', label: 'Ollama', desc: 'Self-hosted — API compatível no servidor local' },
            { id: 'vllm', label: 'vLLM', desc: 'Servidor OpenAI-compat (vLLM, LM Studio, texto)' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => set('llm_provider', p.id)}
              className={`p-3 rounded-md border text-left transition-colors ${provider === p.id ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-border-strong'}`}
            >
              <p className="text-sm font-medium text-fg">{p.label}</p>
              <p className="text-xs text-fg-3 mt-0.5">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {provider === 'openrouter' && (
        <div className="space-y-3">
          <Input
            label="API Key OpenRouter"
            placeholder="sk-or-v1-..."
            type="password"
            value={form.llm_api_key ?? get('llm_api_key')}
            onChange={e => set('llm_api_key', e.target.value)}
          />
          <Input
            label="Modelo primário"
            placeholder="openrouter/free"
            value={form.llm_model ?? get('llm_model')}
            onChange={e => set('llm_model', e.target.value)}
          />
          <Input
            label="Modelo de fallback (opcional)"
            placeholder="ex.: deepseek/deepseek-chat — usado se o primário falhar (rate limit, indisponível, moderação)"
            value={form.llm_openrouter_fallback_model ?? get('llm_openrouter_fallback_model')}
            onChange={e => set('llm_openrouter_fallback_model', e.target.value)}
          />
          <p className="text-xs text-fg-3">
            OpenRouter tenta o fallback automaticamente via parâmetro{' '}
            <code className="text-fg-2">models</code> (
            <a href="https://openrouter.ai/docs/guides/routing/model-fallbacks" target="_blank" rel="noopener" className="text-accent hover:underline">model fallbacks</a>
            ). Obtenha sua chave em{' '}
            <a href="https://openrouter.ai" target="_blank" rel="noopener" className="text-accent hover:underline">openrouter.ai</a>.
          </p>
        </div>
      )}

      {provider === 'ollama' && (
        <SelfHostedModelsConfig
          variant="ollama"
          baseURL={form.llm_ollama_base_url ?? get('llm_ollama_base_url')}
          model={form.llm_ollama_model ?? get('llm_ollama_model')}
          onBaseURLChange={v => set('llm_ollama_base_url', v)}
          onModelChange={v => set('llm_ollama_model', v)}
        />
      )}

      {provider === 'vllm' && (
        <SelfHostedModelsConfig
          variant="vllm"
          baseURL={form.llm_vllm_base_url ?? get('llm_vllm_base_url')}
          model={form.llm_vllm_model ?? get('llm_vllm_model')}
          apiKey={form.llm_vllm_api_key ?? get('llm_vllm_api_key')}
          onBaseURLChange={v => set('llm_vllm_base_url', v)}
          onModelChange={v => set('llm_vllm_model', v)}
          onApiKeyChange={v => set('llm_vllm_api_key', v)}
        />
      )}

      <div className="border border-border rounded-md p-3 space-y-4">
        <div>
          <p className="text-sm font-medium text-fg">Reasoning (chain-of-thought) por provider</p>
          <p className="text-xs text-fg-3 mt-1">
            Modelos como deepseek-v4, gpt-5 e r1 fazem raciocínio interno antes da resposta.
            Por padrão fica desligado — evita truncar o JSON quando max_tokens aperta.
            Ative só para o backend que você usar (cada um é salvo separado).
          </p>
        </div>
        {[
          {
            key: 'llm_reasoning_ollama',
            title: 'Ollama',
            hint: 'URLs self-hosted compatíveis OpenAI (ex.: ollama:11434/v1).',
          },
          {
            key: 'llm_reasoning_vllm',
            title: 'vLLM',
            hint: 'Servidor cuja URL inclui vllm (hostname ou path).',
          },
          {
            key: 'llm_reasoning_openrouter',
            title: 'OpenRouter',
            hint: 'API openrouter.ai e URLs que apontem para ela.',
          },
        ].map(({ key, title, hint }) => (
          <label
            key={key}
            className="flex items-start justify-between gap-3 cursor-pointer border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{title}</p>
              <p className="text-xs text-fg-3 mt-0.5">{hint}</p>
            </div>
            <input
              type="checkbox"
              className="accent-accent w-4 h-4 flex-shrink-0 mt-0.5"
              checked={
                form[key] !== undefined
                  ? form[key] === 'true'
                  : !!(config as Record<string, unknown>)?.[key]
              }
              onChange={e => set(key, String(e.target.checked))}
            />
          </label>
        ))}
      </div>

      <div className="border border-border rounded-md p-3 space-y-2">
        <div>
          <p className="text-sm font-medium text-fg">Temperatura global (opcional)</p>
          <p className="text-xs text-fg-3 mt-0.5">
            Quando preenchida (0–2), substitui a temperatura definida em cada prompt embutido (compose, clusters, etc.).
            Valores mais baixos (~0,1–0,3) reduzem criatividade e tendência a markdown ou texto extra em saídas JSON.
            Deixe em branco para usar o padrão de cada operação.
          </p>
        </div>
        <Input
          label="Temperatura"
          type="number"
          min={0}
          max={2}
          step={0.05}
          placeholder="ex.: 0.2 — vazio = padrão do prompt"
          value={
            form.llm_temperature !== undefined
              ? form.llm_temperature
              : typeof (config as Record<string, unknown>)?.llm_temperature === 'number'
                ? String((config as Record<string, unknown>).llm_temperature)
                : ''
          }
          onChange={e => set('llm_temperature', e.target.value)}
        />
      </div>

      <div className="border border-accent/30 bg-accent/5 rounded-md p-3 flex items-start gap-3">
        <span className="text-base leading-none mt-0.5">🤵</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fg">Automações com IA são geridas pelo Jonfrey</p>
          <p className="text-xs text-fg-3 mt-0.5">
            Auto-curadoria, ajuste de thresholds, auditoria de produtos e outras ações zero-touch ficam em{' '}
            <a href="/automations/jonfrey" className="text-accent hover:underline font-medium">Jonfrey</a>.
            O provider e a API key configurados aqui são usados por todas as ações que tocam LLM.
          </p>
        </div>
      </div>

      <Button variant="primary" size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
        Salvar configuração LLM
      </Button>
    </div>
  )
}

// ───────────────────────────────────────
// Domínio / Branding Tab
// ───────────────────────────────────────

function BrandingTab() {
  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data),
  })

  const get = (key: string) => {
    const v = config?.[key]
    return typeof v === 'object' ? v?.String || '' : v || ''
  }

  const [form, setForm] = useState<Record<string, string>>({})
  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  const saveMut = useMutation({
    mutationFn: () => apiClient.put('/api/config', { ...config, ...form }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); qc.invalidateQueries({ queryKey: ['brand'] }); setForm({}) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const currentDomain = form.app_domain ?? get('app_domain')
  const currentName = form.app_name ?? get('app_name')

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <p className="text-sm font-semibold text-fg mb-1">White-label</p>
        <p className="text-xs text-fg-3 mb-4">Configure o domínio e nome para personalizar os links públicos e a identidade da aplicação.</p>
      </div>

      <div className="space-y-4">
        <Input
          label="Nome da aplicação"
          placeholder="Jon Promo"
          value={currentName}
          onChange={e => set('app_name', e.target.value)}
        />
        <div>
          <Input
            label="Domínio público (sem https://)"
            placeholder="jon.promo"
            value={currentDomain}
            onChange={e => set('app_domain', e.target.value)}
          />
          {currentDomain && (
            <p className="text-xs text-fg-3 mt-1">
              Links públicos: <code className="bg-surface-2 px-1 rounded">https://{currentDomain}/g/{'<slug>'}</code>
            </p>
          )}
        </div>
      </div>

      <div className="bg-surface-2 rounded-md p-4 text-xs text-fg-2 space-y-1">
        <p className="font-medium text-fg">Como configurar:</p>
        <p>1. Aponte <code>jon.promo</code> para o seu IP via DNS (registro A)</p>
        <p>2. Configure o Cloudflare Tunnel com este domínio</p>
        <p>3. Salve aqui — os links gerados usarão o novo domínio</p>
      </div>

      <Button variant="primary" size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
        Salvar domínio
      </Button>
    </div>
  )
}

// ───────────────────────────────────────
// Notificações Section
// ───────────────────────────────────────

function NotificationsSection({
  config,
  localConfig,
  onChange,
}: {
  config: Record<string, unknown> | undefined
  localConfig: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const merged = { ...config, ...localConfig }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-fg">Notificações</p>
        <p className="text-xs text-fg-3 mt-0.5">Alertas de erros, novos produtos e disparos.</p>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={(merged.notify_on_error as boolean) ?? true}
            onChange={e => onChange('notify_on_error', e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-fg">Notificar em erros de disparo</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={(merged.notify_on_new_product as boolean) ?? false}
            onChange={e => onChange('notify_on_new_product', e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-fg">Notificar ao encontrar novo produto</span>
        </label>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Webhook de alertas (URL, opcional)</label>
          <input
            type="url"
            value={(merged.alert_webhook_url as string) ?? ''}
            onChange={e => onChange('alert_webhook_url', e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            placeholder="https://hooks.slack.com/..."
          />
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────
// Geral Tab — 2-col layout
// ───────────────────────────────────────

interface AppConfig {
  global_interval?: number
  send_start_hour?: number
  send_end_hour?: number
  /** Quando false, disparos WhatsApp podem sair 24h */
  dispatch_send_window_enabled?: boolean
  /** IANA, ex. America/Sao_Paulo */
  dispatch_send_timezone?: string
  interval_between_groups?: number
  interval_between_channels?: number
  daily_limit_per_account?: number
  rotate_accounts?: boolean
  notify_on_error?: boolean
  notify_on_new_product?: boolean
  alert_webhook_url?: string
  [key: string]: unknown
}

function GeneralTab() {
  const qc = useQueryClient()
  const [localConfig, setLocalConfig] = useState<Partial<AppConfig>>({})

  const { data: config, isLoading } = useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then((r) => r.data).catch(() => ({})),
  })

  const saveConfig = useMutation({
    mutationFn: (data: Partial<AppConfig>) =>
      apiClient.put('/api/config', data).then((r) => r.data),
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
    <div className="space-y-6">
      {/* Scan interval + horários */}
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <p className="text-sm font-semibold text-fg">Horários e scan</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Intervalo de scan (min)</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={merged.global_interval ?? 30}
              onChange={e => updateField('global_interval', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Início do envio (hora)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={merged.send_start_hour ?? 8}
              onChange={e => updateField('send_start_hour', Number(e.target.value))}
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
              onChange={e => updateField('send_end_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
        </div>
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs text-fg-2 leading-relaxed">
            <strong className="text-fg">Disparos WhatsApp (Evolution):</strong> fora desta janela horária os envios
            ficam na fila até abrir o período — evita mensagens de madrugada ou muito cedo.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(merged.dispatch_send_window_enabled ?? false) as boolean}
              onChange={e => updateField('dispatch_send_window_enabled', e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-fg">Respeitar janela de envio nos disparos (desligado = 24h)</span>
          </label>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Fuso horário (IANA)</label>
            <input
              type="text"
              value={(merged.dispatch_send_timezone as string) ?? 'America/Sao_Paulo'}
              onChange={e => updateField('dispatch_send_timezone', e.target.value)}
              className="w-full max-w-md text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg font-mono"
              placeholder="America/Sao_Paulo"
            />
          </div>
        </div>
      </div>

      {/* Linha 2: Notificações (full width — pode ser expandido) */}
      <NotificationsSection
        config={config}
        localConfig={localConfig}
        onChange={updateField}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={saveConfig.isPending}
          onClick={() => saveConfig.mutate({ ...config, ...localConfig })}
        >
          Salvar configurações
        </Button>

        {saveConfig.isSuccess && (
          <p className="text-xs text-green-400">Configurações salvas com sucesso!</p>
        )}
        {saveConfig.isError && (
          <p className="text-xs text-red-400">Erro ao salvar. Tente novamente.</p>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────
// Danger zone — soft wipe operacional + seeds taxonomia
// ───────────────────────────────────────

function DangerZoneTab() {
  const qc = useQueryClient()
  const [phrase, setPhrase] = useState('')
  const [reseedTaxonomy, setReseedTaxonomy] = useState(false)
  const [reseedCrawlersChannels, setReseedCrawlersChannels] = useState(false)

  const wipeMut = useMutation({
    mutationFn: () =>
      apiClient.post('/api/admin/danger/soft-wipe', {
        confirm: phrase.trim(),
        reseed_taxonomy: reseedTaxonomy,
        reseed_crawlers_channels: reseedCrawlersChannels,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries()
      setPhrase('')
      let msg = 'Soft wipe aplicado.'
      if (reseedTaxonomy) msg += ' Seeds de taxonomia reaplicados.'
      if (reseedCrawlersChannels) msg += ' Seeds de crawlers e canais reaplicados.'
      alert(msg)
    },
    onError: (err: unknown) =>
      alert(String((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (err as Error)?.message ?? 'Erro')),
  })

  return (
    <div className="max-w-lg space-y-4">
      <div className="border border-danger/40 rounded-lg p-4 bg-danger/5 space-y-2">
        <p className="text-sm font-semibold text-danger">Zona perigosa</p>
        <p className="text-xs text-fg-3 leading-relaxed">
          <strong className="text-fg">Soft delete operacional:</strong> arquiva todos os grupos (campo archived), desativa todos os canais e marca todo o catálogo como inativo.
          Espionagens de concorrentes são marcadas como removidas. Contas WhatsApp/Telegram, utilizadores e configurações <strong>não</strong> são apagados.
        </p>
        <p className="text-xs text-fg-3">
          Opcional: reaplicar os <strong>INSERT</strong> de taxonomia da migração (categorias / padrões) com <code className="text-[10px] bg-surface-2 px-1 rounded">ON CONFLICT DO NOTHING</code> — útil depois de limpar dados.
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-fg-2">Confirmação (digite exatamente)</span>
        <Input
          className="mt-1 font-mono text-sm"
          placeholder={SOFT_WIPE_CONFIRM_PHRASE}
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={reseedTaxonomy}
          onChange={e => setReseedTaxonomy(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-sm text-fg">Também reaplicar seeds de taxonomia</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={reseedCrawlersChannels}
          onChange={e => setReseedCrawlersChannels(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-sm text-fg">Também reaplicar seeds de crawlers e canais (tópicos)</span>
      </label>

      <Button
        variant="danger"
        size="sm"
        loading={wipeMut.isPending}
        disabled={phrase.trim() !== SOFT_WIPE_CONFIRM_PHRASE}
        onClick={() => {
          if (!confirm('Tem a certeza? Esta operação é irreversível sem backup.')) return
          wipeMut.mutate()
        }}
      >
        Executar soft wipe
      </Button>
      <p className="text-[11px] text-fg-3">Apenas utilizadores com role <code className="bg-surface-2 px-1 rounded">admin</code>.</p>
    </div>
  )
}

// ───────────────────────────────────────
// Main Component
// ───────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState('general')

  return (
    <div className="p-6">
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        <div className="p-6">
          {tab === 'general' && <GeneralTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'llm' && <LLMTab />}
          {tab === 'branding' && <BrandingTab />}
          {tab === 'danger' && <DangerZoneTab />}
        </div>
      </div>
    </div>
  )
}

// ── Ollama / vLLM (lista via GET …/v1/models ou fallback Ollama) ─────────────

interface ListedModel {
  name: string
  size: number
}

function SelfHostedModelsConfig({
  variant,
  baseURL,
  model,
  apiKey,
  onBaseURLChange,
  onModelChange,
  onApiKeyChange,
}: {
  variant: 'ollama' | 'vllm'
  baseURL: string
  model: string
  apiKey?: string
  onBaseURLChange: (v: string) => void
  onModelChange: (v: string) => void
  onApiKeyChange?: (v: string) => void
}) {
  const defaultURL = variant === 'ollama' ? 'http://localhost:11434' : 'http://localhost:8000'
  const url = baseURL || defaultURL
  const modelsPath =
    variant === 'ollama' ? '/api/admin/llm/ollama/models' : '/api/admin/llm/vllm/models'

  const upstreamAuth =
    apiKey && apiKey.trim() !== ''
      ? apiKey.trim().toLowerCase().startsWith('bearer ')
        ? apiKey.trim()
        : `Bearer ${apiKey.trim()}`
      : undefined

  const { data: models = [], isLoading, isError, error, refetch } = useQuery<ListedModel[]>({
    queryKey: ['self-hosted-llm-models', variant, url, apiKey ?? ''],
    queryFn: () =>
      apiClient
        .get(`${modelsPath}?base_url=${encodeURIComponent(url)}`, {
          headers: upstreamAuth ? { 'X-Snatcher-Upstream-Authorization': upstreamAuth } : {},
        })
        .then(r => r.data ?? []),
    retry: false,
    staleTime: 60_000,
  })

  const fmtSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : ''

  return (
    <div className="space-y-3">
      {variant === 'vllm' && onApiKeyChange && (
        <Input
          label="API key (opcional)"
          placeholder="Deixe vazio se o servidor não exige Bearer"
          type="password"
          value={apiKey ?? ''}
          onChange={e => onApiKeyChange(e.target.value)}
        />
      )}
      <Input
        label={variant === 'ollama' ? 'URL base do Ollama' : 'URL base do servidor (OpenAI-compat)'}
        placeholder={variant === 'ollama' ? 'http://localhost:11434' : 'http://vllm:8000'}
        value={baseURL}
        onChange={e => onBaseURLChange(e.target.value)}
      />
      {variant === 'vllm' && (
        <p className="text-xs text-fg-3">
          A lista de modelos é pedida pelo backend do Snatcher (não pelo browser). Use hostname/IP que esse processo alcance — por exemplo{' '}
          <code className="bg-surface-2 px-1 rounded">http://vllm:8000</code> na mesma rede Docker.{' '}
          <code className="bg-surface-2 px-1 rounded">localhost</code> aqui é o próprio host/container do Snatcher. Se omitires{' '}
          <code className="bg-surface-2 px-1 rounded">http://</code>, o servidor assume HTTP.
        </p>
      )}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-fg-2">Modelo</label>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs text-accent hover:underline"
          >
            ↻ atualizar lista
          </button>
        </div>
        {isLoading ? (
          <div className="h-9 bg-surface-2 rounded animate-pulse" />
        ) : isError ? (
          <div className="space-y-2">
            <Input
              placeholder={variant === 'ollama' ? 'llama3:8b' : 'nome-do-modelo'}
              value={model}
              onChange={e => onModelChange(e.target.value)}
            />
            <p className="text-xs text-danger">
              Não foi possível buscar modelos: {(error as any)?.response?.data?.error ?? (error as any)?.message ?? 'erro'}
            </p>
          </div>
        ) : models.length === 0 ? (
          <div className="space-y-2">
            <Input
              placeholder={variant === 'ollama' ? 'llama3:8b' : 'nome-do-modelo'}
              value={model}
              onChange={e => onModelChange(e.target.value)}
            />
            <p className="text-xs text-fg-3">
              {variant === 'ollama' ? (
                <>
                  Servidor Ollama vazio. Baixe um modelo:{' '}
                  <code className="bg-surface-2 px-1 rounded">ollama pull llama3</code>
                </>
              ) : (
                <>
                  Lista vazia ou servidor ainda carregando o modelo —{' '}
                  <code className="bg-surface-2 px-1 rounded">GET /v1/models</code> pode demorar até o engine ficar pronto.
                </>
              )}
            </p>
          </div>
        ) : (
          <select
            value={model}
            onChange={e => onModelChange(e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2.5 py-2 bg-surface text-fg outline-none focus:border-accent"
          >
            <option value="">Selecione um modelo...</option>
            {models.map(m => {
              const sz = fmtSize(m.size)
              return (
                <option key={m.name} value={m.name}>
                  {m.name}{sz ? ` (${sz})` : ''}
                </option>
              )
            })}
          </select>
        )}
      </div>
      <p className="text-xs text-fg-3">
        {models.length > 0
          ? `${models.length} modelo${models.length !== 1 ? 's' : ''} disponíve${models.length !== 1 ? 'is' : 'l'} no servidor.`
          : variant === 'ollama'
            ? 'Certifique-se que o Ollama está rodando e que o backend Snatcher consegue abrir essa URL.'
            : 'Confira DNS/rede Docker, porta e se o vLLM já terminou de carregar o modelo.'}
      </p>
    </div>
  )
}
