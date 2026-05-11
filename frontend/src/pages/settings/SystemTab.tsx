import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Switch } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { sectionCard, sectionTitle, formGroup, formLabel, formHint, switchRow } from '../../lib/uiTokens'

interface AppConfig {
  gtm_container_id?: string | null
  global_interval?: number
  send_start_hour?: number
  send_end_hour?: number
  dispatch_send_window_enabled?: boolean
  dispatch_send_timezone?: string
  dispatch_min_interval_ms?: number
  dispatch_max_per_group_per_hour?: number
  [key: string]: unknown
}

export function SystemTab() {
  const qc = useQueryClient()
  const [local, setLocal] = useState<Partial<AppConfig>>({})

  const { data: config, isLoading } = useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
  })

  const saveMut = useMutation({
    mutationFn: (data: Partial<AppConfig>) => apiClient.put('/api/config', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); setLocal({}) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const upd = (key: keyof AppConfig, value: unknown) => setLocal(p => ({ ...p, [key]: value }))
  const merged: AppConfig = { ...config, ...local }

  if (isLoading && !config) return <div className="text-sm text-fg-3">Carregando...</div>

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Scan & envio */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-4`}>Scan e janela de envio</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className={formGroup}>
            <label className={formLabel}>Intervalo de scan (min)</label>
            <input
              type="number" min={5} max={1440}
              value={merged.global_interval ?? 30}
              onChange={e => upd('global_interval', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Início do envio (hora)</label>
            <input
              type="number" min={0} max={23}
              value={merged.send_start_hour ?? 8}
              onChange={e => upd('send_start_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Fim do envio (hora)</label>
            <input
              type="number" min={0} max={23}
              value={merged.send_end_hour ?? 22}
              onChange={e => upd('send_end_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            />
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div className={switchRow}>
            <div>
              <p className={formLabel}>Janela de envio (WA)</p>
              <p className={formHint}>
                Fora do horário acima: auto-match e ads NÃO enfileiram, e pending_approval não vira queued. Disparos manuais continuam funcionando.
              </p>
            </div>
            <Switch
              checked={(merged.dispatch_send_window_enabled ?? false) as boolean}
              onChange={v => upd('dispatch_send_window_enabled', v)}
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Fuso horário (IANA)</label>
            <input
              type="text"
              value={(merged.dispatch_send_timezone as string) ?? 'America/Sao_Paulo'}
              onChange={e => upd('dispatch_send_timezone', e.target.value)}
              className="w-full max-w-md text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg font-mono"
              placeholder="America/Sao_Paulo"
            />
          </div>
        </div>
      </div>

      {/* Rate limits */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-4`}>Rate limits de disparo</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={formGroup}>
            <label className={formLabel}>Intervalo mínimo entre grupos (ms)</label>
            <input
              type="number" min={0}
              value={(merged.dispatch_min_interval_ms as number) ?? ''}
              onChange={e => upd('dispatch_min_interval_ms', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
              placeholder="0"
            />
          </div>
          <div className={formGroup}>
            <label className={formLabel}>Máx. disparos por grupo/hora</label>
            <input
              type="number" min={0}
              value={(merged.dispatch_max_per_group_per_hour as number) ?? ''}
              onChange={e => upd('dispatch_max_per_group_per_hour', Number(e.target.value))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
              placeholder="ilimitado"
            />
          </div>
        </div>
      </div>

      {/* Google Tag Manager */}
      <div className={sectionCard}>
        <p className={`${sectionTitle} mb-3`}>Google Tag Manager</p>
        <div className={formGroup}>
          <label className={formLabel}>Container ID</label>
          <input
            type="text"
            value={(merged.gtm_container_id as string) ?? ''}
            onChange={e => upd('gtm_container_id', e.target.value.trim() || null)}
            className="w-full max-w-md text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg font-mono"
            placeholder="GTM-XXXXXXX"
            spellCheck={false}
            autoCapitalize="characters"
          />
          <p className={formHint}>Carrega em todas as rotas via <code>/api/brand</code></p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" loading={saveMut.isPending}
          onClick={() => saveMut.mutate({ ...config, ...local })}>
          Salvar
        </Button>
        {saveMut.isSuccess && <p className="text-xs text-green-400">Salvo.</p>}
        {saveMut.isError && <p className="text-xs text-danger">Erro ao salvar.</p>}
      </div>
    </div>
  )
}
