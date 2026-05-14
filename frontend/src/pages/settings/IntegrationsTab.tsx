import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionTitle, formGroup, formLabel, formHint } from '../../lib/uiTokens'

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
      return apiClient.put('/api/config', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); qc.invalidateQueries({ queryKey: ['brand'] }); setForm({}) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  if (isLoading && !config) return <div className="text-sm text-fg-3">Carregando...</div>

  return (
    <div className="space-y-5 max-w-lg">

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
        {saveMut.isSuccess && <p className="text-xs text-success">Salvo.</p>}
        {saveMut.isError && <p className="text-xs text-danger">Erro ao salvar.</p>}
      </div>
    </div>
  )
}
