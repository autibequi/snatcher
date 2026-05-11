import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionTitle, formGroup, formLabel, formHint, switchRow } from '../../lib/uiTokens'

// ── Ollama / vLLM model list ─────────────────────────────────────────────────

interface ListedModel { name: string; size: number }

function SelfHostedModelsConfig({
  variant, baseURL, model, apiKey,
  onBaseURLChange, onModelChange, onApiKeyChange,
}: {
  variant: 'ollama' | 'vllm'
  baseURL: string; model: string; apiKey?: string
  onBaseURLChange: (v: string) => void
  onModelChange: (v: string) => void
  onApiKeyChange?: (v: string) => void
}) {
  const defaultURL = variant === 'ollama' ? 'http://localhost:11434' : 'http://localhost:8000'
  const url = baseURL || defaultURL
  const modelsPath = variant === 'ollama' ? '/api/admin/llm/ollama/models' : '/api/admin/llm/vllm/models'
  const upstreamAuth = apiKey?.trim()
    ? (apiKey.trim().toLowerCase().startsWith('bearer ') ? apiKey.trim() : `Bearer ${apiKey.trim()}`)
    : undefined

  const { data: models = [], isLoading, isError, error, refetch } = useQuery<ListedModel[]>({
    queryKey: ['self-hosted-llm-models', variant, url, apiKey ?? ''],
    queryFn: () =>
      apiClient.get(`${modelsPath}?base_url=${encodeURIComponent(url)}`, {
        headers: upstreamAuth ? { 'X-Snatcher-Upstream-Authorization': upstreamAuth } : {},
      }).then(r => r.data ?? []),
    retry: false,
    staleTime: 60_000,
  })

  const fmtSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : ''

  return (
    <div className="space-y-3">
      {variant === 'vllm' && onApiKeyChange && (
        <Input label="API key (opcional)" placeholder="Deixe vazio se o servidor nao exige Bearer"
          type="password" value={apiKey ?? ''} onChange={e => onApiKeyChange(e.target.value)} />
      )}
      <Input
        label={variant === 'ollama' ? 'URL base do Ollama' : 'URL base do servidor (OpenAI-compat)'}
        placeholder={variant === 'ollama' ? 'http://localhost:11434' : 'http://vllm:8000'}
        value={baseURL} onChange={e => onBaseURLChange(e.target.value)}
      />
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={formLabel}>Modelo</label>
          <button type="button" onClick={() => refetch()} className="text-xs text-accent hover:underline">
            Atualizar lista
          </button>
        </div>
        {isLoading ? (
          <div className="h-9 bg-surface-2 rounded animate-pulse" />
        ) : isError ? (
          <div className="space-y-1">
            <Input placeholder={variant === 'ollama' ? 'llama3:8b' : 'nome-do-modelo'}
              value={model} onChange={e => onModelChange(e.target.value)} />
            <p className="text-xs text-danger">
              Erro ao buscar modelos: {(error as any)?.response?.data?.error ?? (error as any)?.message ?? 'erro'}
            </p>
          </div>
        ) : models.length === 0 ? (
          <div className="space-y-1">
            <Input placeholder={variant === 'ollama' ? 'llama3:8b' : 'nome-do-modelo'}
              value={model} onChange={e => onModelChange(e.target.value)} />
            <p className="text-xs text-fg-3">
              {variant === 'ollama'
                ? 'Servidor vazio. Baixe um modelo: ollama pull llama3'
                : 'Lista vazia ou servidor ainda carregando.'}
            </p>
          </div>
        ) : (
          <select value={model} onChange={e => onModelChange(e.target.value)}
            className="w-full text-sm border border-border rounded-md px-2.5 py-2 bg-surface text-fg outline-none focus:border-accent">
            <option value="">Selecione um modelo...</option>
            {models.map(m => {
              const sz = fmtSize(m.size)
              return <option key={m.name} value={m.name}>{m.name}{sz ? ` (${sz})` : ''}</option>
            })}
          </select>
        )}
        {models.length > 0 && (
          <p className="text-xs text-fg-3 mt-1">
            {models.length} modelo{models.length !== 1 ? 's' : ''} disponivel{models.length !== 1 ? 'is' : ''}.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function IntegrationsTab() {
  const qc = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
  })

  const [form, setForm] = useState<Record<string, unknown>>({})
  const get = (k: string): string => {
    if (form[k] !== undefined) return form[k] as string
    const v = config?.[k]
    return typeof v === 'object' ? (v as any)?.String ?? '' : (v as string) ?? ''
  }
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { ...config, ...form }
      const boolFields = ['llm_reasoning_ollama', 'llm_reasoning_vllm', 'llm_reasoning_openrouter']
      for (const k of boolFields) {
        if (payload[k] === 'true') payload[k] = true
        else if (payload[k] === 'false') payload[k] = false
      }
      const rawTemp = payload.llm_temperature
      if (rawTemp === '' || rawTemp == null) payload.llm_temperature = null
      else if (typeof rawTemp === 'string') {
        const n = Number(rawTemp)
        payload.llm_temperature = Number.isFinite(n) ? n : null
      }
      return apiClient.put('/api/config', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); qc.invalidateQueries({ queryKey: ['brand'] }); setForm({}) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const provider = (form.llm_provider ?? get('llm_provider') ?? 'openrouter') as string
  const getChecked = (key: string): boolean =>
    form[key] !== undefined ? form[key] === 'true' : !!(config as Record<string, unknown>)?.[key]

  if (isLoading && !config) return <div className="text-sm text-fg-3">Carregando...</div>

  return (
    <div className="space-y-5 max-w-lg">

      {/* LLM Provider */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-4`}>Provider de IA</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {[
            { id: 'openrouter', label: 'OpenRouter', desc: 'API cloud — varios modelos' },
            { id: 'ollama', label: 'Ollama', desc: 'Self-hosted local' },
            { id: 'vllm', label: 'vLLM', desc: 'Servidor OpenAI-compat' },
          ].map(p => (
            <button key={p.id} type="button" onClick={() => set('llm_provider', p.id)}
              className={`p-3 rounded-md border text-left transition-colors ${
                provider === p.id ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-border-strong'
              }`}>
              <p className="text-sm font-medium text-fg">{p.label}</p>
              <p className="text-xs text-fg-3 mt-0.5">{p.desc}</p>
            </button>
          ))}
        </div>

        {provider === 'openrouter' && (
          <div className="space-y-3">
            <Input label="API Key OpenRouter" placeholder="sk-or-v1-..." type="password"
              value={get('llm_api_key')} onChange={e => set('llm_api_key', e.target.value)} />
            <Input label="Modelo primario" placeholder="openrouter/free"
              value={get('llm_model')} onChange={e => set('llm_model', e.target.value)} />
            <Input label="Modelo de fallback (opcional)"
              placeholder="deepseek/deepseek-chat"
              value={get('llm_openrouter_fallback_model')}
              onChange={e => set('llm_openrouter_fallback_model', e.target.value)} />
          </div>
        )}

        {provider === 'ollama' && (
          <SelfHostedModelsConfig variant="ollama"
            baseURL={get('llm_ollama_base_url')} model={get('llm_ollama_model')}
            onBaseURLChange={v => set('llm_ollama_base_url', v)}
            onModelChange={v => set('llm_ollama_model', v)} />
        )}

        {provider === 'vllm' && (
          <SelfHostedModelsConfig variant="vllm"
            baseURL={get('llm_vllm_base_url')} model={get('llm_vllm_model')}
            apiKey={get('llm_vllm_api_key')}
            onBaseURLChange={v => set('llm_vllm_base_url', v)}
            onModelChange={v => set('llm_vllm_model', v)}
            onApiKeyChange={v => set('llm_vllm_api_key', v)} />
        )}

        {/* Reasoning toggles */}
        <div className="border-t border-border mt-4 pt-4 space-y-3">
          <p className={`${formLabel} mb-1`}>Reasoning (chain-of-thought)</p>
          {[
            { key: 'llm_reasoning_ollama', title: 'Ollama' },
            { key: 'llm_reasoning_vllm', title: 'vLLM' },
            { key: 'llm_reasoning_openrouter', title: 'OpenRouter' },
          ].map(({ key, title }) => (
            <div key={key} className={switchRow}>
              <p className={formLabel}>{title}</p>
              <Switch
                checked={getChecked(key)}
                onChange={v => set(key, String(v))}
              />
            </div>
          ))}
        </div>

        {/* Temperature */}
        <div className="border-t border-border mt-4 pt-4">
          <div className={formGroup}>
            <label className={formLabel}>Temperatura global (opcional, 0-2)</label>
            <Input type="number" min={0} max={2} step={0.05}
              placeholder="vazio = padrao do prompt"
              value={
                form.llm_temperature !== undefined
                  ? form.llm_temperature as string
                  : typeof (config as Record<string, unknown>)?.llm_temperature === 'number'
                    ? String((config as Record<string, unknown>).llm_temperature)
                    : ''
              }
              onChange={e => set('llm_temperature', e.target.value)}
            />
            <p className={formHint}>Valores baixos (~0.1-0.3) reduzem saidas JSON extras</p>
          </div>
        </div>
      </div>

      {/* Telegram */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Telegram Bot</p>
        <div className="space-y-3">
          <Input label="Bot Token" type="password" placeholder="1234567890:AAF..."
            value={get('tg_bot_token')} onChange={e => set('tg_bot_token', e.target.value)} />
          <Input label="Bot Username" placeholder="@meu_bot"
            value={get('tg_bot_username')} onChange={e => set('tg_bot_username', e.target.value)} />
        </div>
      </div>

      {/* Evolution WA */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Evolution WhatsApp</p>
        <div className="space-y-3">
          <Input label="URL" placeholder="https://evolution.meuservidor.com"
            value={get('evolution_base_url')} onChange={e => set('evolution_base_url', e.target.value)} />
          <Input label="API Key" type="password" placeholder="evolution_api_key"
            value={get('evolution_api_key')} onChange={e => set('evolution_api_key', e.target.value)} />
          <Input label="Instance" placeholder="minha_instancia"
            value={get('evolution_instance')} onChange={e => set('evolution_instance', e.target.value)} />
        </div>
      </div>

      {/* Domain / White-label */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>White-label</p>
        <div className="space-y-3">
          <Input label="Nome da aplicacao" placeholder="Jon Promo"
            value={get('app_name')} onChange={e => set('app_name', e.target.value)} />
          <div className={formGroup}>
            <label className={formLabel}>Dominio publico (sem https://)</label>
            <Input placeholder="jon.promo"
              value={get('app_domain')} onChange={e => set('app_domain', e.target.value)} />
            {get('app_domain') && (
              <p className={formHint}>
                Links: <code className="bg-surface-2 px-1 rounded">https://{get('app_domain')}/g/{'<slug>'}</code>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
          Salvar
        </Button>
        {saveMut.isSuccess && <p className="text-xs text-green-400">Salvo.</p>}
        {saveMut.isError && <p className="text-xs text-danger">Erro ao salvar.</p>}
      </div>
    </div>
  )
}
